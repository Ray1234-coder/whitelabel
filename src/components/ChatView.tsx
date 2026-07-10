"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ArrowUp, MessageSquare, Plus, Wrench } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { AgentRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SessionHistoryEntry {
  role: "user" | "assistant" | "system";
  content: string;
}

interface SessionMeta {
  id: string;
  title: string | null;
  message_count: number;
  started_at: number | string | null;
  last_active: number | string | null;
  preview: string | null;
}

function sessionKey(agentId: string) {
  return `workify_chat_session_${agentId}`;
}

const STARTERS = [
  {
    label: "Connect my Gmail",
    prompt: "Can you connect to my Gmail so you can read and send emails for me?",
  },
  {
    label: "What can you do?",
    prompt: "What can you do for me? List your capabilities and the apps you can connect to.",
  },
  {
    label: "Send messages for me",
    prompt:
      "Can you send messages for me — WhatsApp, SMS, or Slack? What messaging apps can you connect to?",
  },
  {
    label: "Put you on my website",
    prompt:
      "I want to integrate you into another website, like a support chat widget. How would we set that up?",
  },
];

function fmtWhen(v: number | string | null): string {
  if (v == null) return "";
  // Numeric timestamps may arrive as epoch seconds or milliseconds.
  const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
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

function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 underline underline-offset-2 break-all hover:text-blue-700"
          >
            {children}
          </a>
        ),
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        code: ({ children, className }) =>
          className ? (
            <code className={cn("font-mono text-xs", className)}>{children}</code>
          ) : (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</code>
          ),
        pre: ({ children }) => (
          <pre className="mb-2 overflow-x-auto rounded-lg bg-muted p-3 last:mb-0">{children}</pre>
        ),
        h1: ({ children }) => <p className="mb-2 font-semibold">{children}</p>,
        h2: ({ children }) => <p className="mb-2 font-semibold">{children}</p>,
        h3: ({ children }) => <p className="mb-2 font-semibold">{children}</p>,
        blockquote: ({ children }) => (
          <blockquote className="mb-2 border-l-2 border-border pl-3 text-muted-foreground last:mb-0">
            {children}
          </blockquote>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function ChatView({ agentId }: { agentId: string }) {
  const [agent, setAgent] = useState<AgentRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
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

  const refreshSessions = useCallback(async () => {
    try {
      const data = await apiFetch<{ data?: SessionMeta[] }>(`/api/agents/${agentId}/sessions`);
      if (mountedRef.current) setSessions(data.data ?? []);
    } catch {
      /* agent may be waking — sidebar just stays as-is */
    }
  }, [agentId]);

  const loadSession = useCallback(
    async (sid: string) => {
      try {
        const data = await apiFetch<{ history?: SessionHistoryEntry[] }>(
          `/api/agents/${agentId}/sessions/${sid}`
        );
        if (!mountedRef.current) return false;
        setMessages(
          (data.history ?? [])
            .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
            .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
        );
        sessionRef.current = sid;
        setActiveSession(sid);
        localStorage.setItem(sessionKey(agentId), sid);
        return true;
      } catch {
        return false;
      }
    },
    [agentId]
  );

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const { agent: row } = await apiFetch<{ agent: AgentRow }>(`/api/agents/${agentId}`);
        if (!cancelled) setAgent(row);
      } catch (e) {
        if (!cancelled) toast.error((e as Error).message);
      }
      await refreshSessions();
      const stored = localStorage.getItem(sessionKey(agentId));
      if (stored && !cancelled) {
        const ok = await loadSession(stored);
        if (!ok) {
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
  }, [agentId, refreshSessions, loadSession]);

  const send = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || streaming) return;
    const isNewSession = !sessionRef.current;
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
            if (mountedRef.current) setActiveSession(d.session_id);
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
      } else if (frame.event === "response.completed") {
        try {
          const d = JSON.parse(frame.data) as { output_text?: string };
          if (typeof d.output_text === "string" && d.output_text && mountedRef.current) {
            const finalText = d.output_text;
            setMessages((m) => {
              const next = [...m];
              next[next.length - 1] = { role: "assistant", content: finalText };
              return next;
            });
          }
        } catch {
          /* keep streamed deltas */
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
      if (isNewSession) refreshSessions();
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
  }, [agentId, input, streaming, refreshSessions]);

  function newChat() {
    sessionRef.current = null;
    localStorage.removeItem(sessionKey(agentId));
    setActiveSession(null);
    setMessages([]);
  }

  const agentName = agent?.name || "Agent";
  const running = agent?.status === "running" || agent?.status === "sleeping";

  return (
    <div className="flex h-[calc(100vh-3rem)] gap-6 md:h-[calc(100vh-3.5rem)]">
      {/* Previous chats */}
      <aside className="hidden w-60 shrink-0 flex-col border-r pr-4 md:flex">
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-sm font-semibold">Chats</h2>
          <Button variant="outline" size="sm" onClick={newChat} disabled={streaming}>
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {sessions.length === 0 && (
            <p className="px-2 py-4 text-xs text-muted-foreground">
              No chats yet — say hello to start your first one.
            </p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={streaming}
              onClick={() => loadSession(s.id)}
              className={cn(
                "w-full rounded-lg px-3 py-2 text-left transition-colors",
                s.id === activeSession ? "bg-secondary" : "hover:bg-accent/60",
                streaming && "cursor-not-allowed opacity-60"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {s.title || s.preview || "Untitled chat"}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {fmtWhen(s.last_active)}
                </span>
              </div>
              {s.title && s.preview && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.preview}</p>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
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
          <Button variant="outline" size="sm" onClick={newChat} disabled={streaming} className="md:hidden">
            <Plus className="h-4 w-4" />
            New chat
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto py-6">
          {messages.length === 0 && !loading && (
            <div className="flex h-full items-center justify-center">
              <div className="w-full max-w-md text-center">
                <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Ask {agentName} anything — it can browse, write, code, and work with files.
                  Every chat is saved on the left so you can pick up where you left off.
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      disabled={streaming}
                      onClick={() => send(s.prompt)}
                      className="rounded-xl border bg-background px-4 py-3 text-left text-sm transition-colors hover:border-ring hover:bg-accent/40"
                    >
                      <span className="font-medium">{s.label}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {s.prompt}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              {m.role === "user" ? (
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                  {m.content}
                </div>
              ) : (
                <div className="max-w-[85%] rounded-2xl rounded-bl-md border bg-muted/40 px-4 py-2.5 text-sm leading-relaxed">
                  {m.content ? (
                    <Markdown content={m.content} />
                  ) : streaming && i === messages.length - 1 ? (
                    "…"
                  ) : (
                    ""
                  )}
                </div>
              )}
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
    </div>
  );
}
