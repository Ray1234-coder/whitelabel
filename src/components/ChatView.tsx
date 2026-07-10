"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUp, Plus, Wrench } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { AgentRow } from "@/lib/types";
import { Button } from "@/components/ui/button";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SessionHistoryEntry {
  role: "user" | "assistant" | "system";
  content: string;
}

function sessionKey(agentId: string) {
  return `workify_chat_session_${agentId}`;
}

// Tolerant SSE frame parser: yields { event, data } per frame, skips keepalive comments.
// Handles CRLF streams and multi-line data: fields (joined with \n per the SSE spec).
function parseFrames(buffer: string): { frames: { event: string; data: string }[]; rest: string } {
  // A trailing lone \r may be the first half of a chunk-split \r\n — hold it back.
  let carry = "";
  let work = buffer;
  if (work.endsWith("\r")) {
    carry = "\r";
    work = work.slice(0, -1);
  }
  work = work.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = work.split("\n\n");
  const rest = (parts.pop() ?? "") + carry;
  const frames: { event: string; data: string }[] = [];
  for (const part of parts) {
    let event = "";
    const data: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (event || data.length) frames.push({ event, data: data.join("\n") });
  }
  return { frames, rest };
}

function deltaText(data: string): string {
  try {
    const d = JSON.parse(data) as Record<string, unknown>;
    for (const key of ["delta", "text", "output_text", "content"]) {
      if (typeof d[key] === "string") return d[key] as string;
    }
  } catch {
    /* non-JSON delta */
  }
  return "";
}

export function ChatView({ agentId }: { agentId: string }) {
  const [agent, setAgent] = useState<AgentRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activity, setActivity] = useState("");
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activity]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const { agent: row } = await apiFetch<{ agent: AgentRow }>(`/api/agents/${agentId}`);
        if (!cancelled) setAgent(row);
      } catch (e) {
        if (!cancelled) toast.error((e as Error).message);
      }
      const stored = localStorage.getItem(sessionKey(agentId));
      if (stored) {
        sessionRef.current = stored;
        try {
          const data = await apiFetch<{ history?: SessionHistoryEntry[] }>(
            `/api/agents/${agentId}/sessions/${stored}`
          );
          if (!cancelled && data.history) {
            setMessages(
              data.history
                .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
                .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
            );
          }
        } catch {
          // Session no longer exists on the agent — start fresh.
          sessionRef.current = null;
          localStorage.removeItem(sessionKey(agentId));
        }
      }
      if (!cancelled) setLoading(false);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);
    setActivity("Thinking…");

    const controller = new AbortController();
    abortRef.current = controller;
    let failed: string | null = null;

    const handleFrame = (frame: { event: string; data: string }) => {
      if (frame.event === "response.created") {
        try {
          const d = JSON.parse(frame.data) as { session_id?: string };
          if (d.session_id) {
            sessionRef.current = d.session_id;
            localStorage.setItem(sessionKey(agentId), d.session_id);
          }
        } catch {
          /* tolerate */
        }
      } else if (frame.event === "response.output_text.delta") {
        const delta = deltaText(frame.data);
        if (delta && mountedRef.current) {
          setActivity("");
          setMessages((m) => {
            const next = [...m];
            next[next.length - 1] = {
              role: "assistant",
              content: next[next.length - 1].content + delta,
            };
            return next;
          });
        }
      } else if (frame.event === "response.tool_call.started") {
        if (mountedRef.current) setActivity("Working…");
      } else if (frame.event === "response.reasoning.delta") {
        if (mountedRef.current) setActivity("Thinking…");
      } else if (frame.event === "response.failed") {
        try {
          const d = JSON.parse(frame.data) as { error?: { message?: string } };
          failed = d.error?.message || "The agent failed to respond.";
        } catch {
          failed = "The agent failed to respond.";
        }
      }
    };

    try {
      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          input: text,
          ...(sessionRef.current ? { session_id: sessionRef.current } : {}),
        }),
      });

      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message || `Chat failed (HTTP ${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { frames, rest } = parseFrames(buffer);
          buffer = rest;
          frames.forEach(handleFrame);
        }
        // Flush the decoder and any final frame the server closed without a blank line after.
        buffer += decoder.decode();
        parseFrames(buffer + "\n\n").frames.forEach(handleFrame);
      } finally {
        reader.cancel().catch(() => {});
      }

      if (failed && mountedRef.current) {
        toast.error(failed);
        setMessages((m) => (m[m.length - 1]?.content === "" ? m.slice(0, -1) : m));
      }
    } catch (e) {
      if (!controller.signal.aborted && mountedRef.current) {
        toast.error((e as Error).message);
        setMessages((m) => (m[m.length - 1]?.content === "" ? m.slice(0, -1) : m));
      }
    } finally {
      if (mountedRef.current) {
        setStreaming(false);
        setActivity("");
      }
    }
  }, [agentId, input, streaming]);

  function newChat() {
    sessionRef.current = null;
    localStorage.removeItem(sessionKey(agentId));
    setMessages([]);
  }

  const agentName = agent?.name || "Agent";
  const running = agent?.status === "running" || agent?.status === "sleeping";

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col md:h-[calc(100vh-3.5rem)]">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex h-8 w-8 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-accent"
            aria-label="Back to agents"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="font-semibold leading-tight">{agentName}</h1>
            <p className="text-xs text-muted-foreground">
              {loading ? "Loading…" : running ? "Online" : agent?.status ?? "unknown"}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={newChat} disabled={streaming}>
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto py-6">
        {messages.length === 0 && !loading && (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-sm text-center text-sm text-muted-foreground">
              Ask {agentName} anything — it can browse, write, code, and work with files. The
              conversation picks up where you left off.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                  : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md border bg-muted/40 px-4 py-2.5 text-sm"
              }
            >
              {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
            </div>
          </div>
        ))}
        {activity && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wrench className="h-3.5 w-3.5 animate-pulse" />
            {activity}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder={streaming ? "Waiting for the agent…" : `Message ${agentName}`}
          disabled={streaming}
          className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border bg-background px-4 py-2.5 text-sm focus:border-ring focus:outline-none disabled:opacity-60"
        />
        <Button type="submit" size="icon" className="h-11 w-11 rounded-xl" disabled={streaming || !input.trim()} aria-label="Send message">
          <ArrowUp className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
