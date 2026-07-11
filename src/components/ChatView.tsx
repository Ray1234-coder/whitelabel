"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Sparkles,
  Webhook,
  Wrench,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { stripHouseStyle } from "@/config/houseStyle";
import type { AgentRow, Automation } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ToolCall {
  tool: string;
  label?: string;
  status: "running" | "ok" | "error";
  error?: string;
  duration_ms?: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  // Tool calls the agent made while producing this message (live during streaming).
  tools?: ToolCall[];
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

// The visible first message a "Get started" click sends. The agent receives it
// alongside the hidden onboarding intake (server-side), which turns it into a
// guided discovery rather than a plain capability dump.
const GET_STARTED_KICKOFF =
  "I'm just getting started with you. Can you help me figure out how you could help with my work?";

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

// Turn a raw tool id like "gmail.send_email" or "web_search" into something a
// non-technical person can read at a glance: "Gmail send email", "Web search".
function prettyTool(tool: string): string {
  const cleaned = tool.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Tool";
}

// The live checklist of tools the agent used for one message — a spinner while a
// tool runs, a green check when it succeeds, a red mark when it fails.
function ToolList({ tools }: { tools: ToolCall[] }) {
  return (
    <div className="mb-2 space-y-1.5 rounded-lg border bg-background/60 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Working
      </p>
      {tools.map((t, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          {t.status === "running" ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : t.status === "ok" ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
          ) : (
            <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
          )}
          <span className="truncate font-medium">{t.label || prettyTool(t.tool)}</span>
          {t.status === "ok" && t.duration_ms != null && (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {(t.duration_ms / 1000).toFixed(1)}s
            </span>
          )}
          {t.status === "error" && (
            <span className="truncate text-[11px] text-red-600">
              {t.error ? `failed — ${t.error}` : "failed"}
            </span>
          )}
        </div>
      ))}
    </div>
  );
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

export function ChatView({ agentId, standalone }: { agentId: string; standalone?: boolean }) {
  const [agent, setAgent] = useState<AgentRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activity, setActivity] = useState("");
  const [loading, setLoading] = useState(true);
  const [attachments, setAttachments] = useState<{ path: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  // Right-side panel: Chats · Workflows · Knowledge, all in one place.
  // What's open in the right panel (Claude-style): a workflow, the knowledge
  // base, or nothing (chat is full-width).
  const [openItem, setOpenItem] = useState<
    { type: "workflow"; id: string } | { type: "knowledge" } | null
  >(null);
  const [workflows, setWorkflows] = useState<Automation[] | null>(null);
  const [kb, setKb] = useState("");
  const [kbSaved, setKbSaved] = useState("");
  const [kbSaving, setKbSaving] = useState(false);
  const [kbLoaded, setKbLoaded] = useState(false);
  const [highlightWorkflowId, setHighlightWorkflowId] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  // Always points at the latest workflow-detector so send() (memoized) never
  // calls a stale version with a null workspace.
  const wfRef = useRef<(text: string) => void>(() => {});

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
            .map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.role === "user" ? stripHouseStyle(m.content) : m.content,
            }))
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

  const send = useCallback(async (override?: string, opts?: { onboarding?: boolean }) => {
    const typed = (override ?? input).trim();
    // Attachments belong only to the composer — starters/onboarding never carry files.
    const files = override === undefined ? attachments : [];
    if ((!typed && files.length === 0) || streaming || uploading) return;

    // Show (and send) the filenames so the transcript makes sense; the agent also
    // gets the file paths via the `files` array and reads them from disk.
    const names = files.map((f) => f.name);
    const attachLine = names.length ? `📎 ${names.join(", ")}` : "";
    const text = typed
      ? [typed, attachLine].filter(Boolean).join("\n\n")
      : `Here's ${names.length > 1 ? `${names.length} files` : "a file"} for you:\n${attachLine}`;

    const isNewSession = !sessionRef.current;
    setInput("");
    if (override === undefined) setAttachments([]);
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);
    setActivity("Thinking…");

    const controller = new AbortController();
    abortRef.current = controller;
    let failed: string | null = null;
    let assembled = ""; // full assistant text, for post-stream workflow detection

    // Mutate the tool-call list on the in-flight assistant message (the last one).
    const updateTools = (fn: (tools: ToolCall[]) => ToolCall[]) => {
      if (!mountedRef.current) return;
      setMessages((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        if (!last || last.role !== "assistant") return m;
        next[next.length - 1] = { ...last, tools: fn(last.tools ?? []) };
        return next;
      });
    };
    // Match a completed/failed event to the most recent still-running call of the
    // same tool (there are no call ids in the stream, so we pair by name + order).
    const settleTool = (tool: string, patch: Partial<ToolCall>) =>
      updateTools((tools) => {
        for (let i = tools.length - 1; i >= 0; i--) {
          if (tools[i].status === "running" && (!tool || tools[i].tool === tool)) {
            const copy = [...tools];
            copy[i] = { ...copy[i], ...patch };
            return copy;
          }
        }
        return [...tools, { tool, status: patch.status ?? "ok", ...patch }];
      });

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
          assembled += delta;
          setMessages((m) => {
            const next = [...m];
            const prev = next[next.length - 1];
            next[next.length - 1] = { ...prev, role: "assistant", content: prev.content + delta };
            return next;
          });
        }
      } else if (frame.event === "response.completed") {
        try {
          const d = JSON.parse(frame.data) as { output_text?: string };
          if (typeof d.output_text === "string" && d.output_text && mountedRef.current) {
            const finalText = d.output_text;
            assembled = finalText;
            setMessages((m) => {
              const next = [...m];
              next[next.length - 1] = { ...next[next.length - 1], role: "assistant", content: finalText };
              return next;
            });
          }
        } catch {
          /* keep streamed deltas */
        }
      } else if (frame.event === "response.tool_call.started") {
        if (mountedRef.current) setActivity("");
        let tool = "";
        let label: string | undefined;
        try {
          const d = JSON.parse(frame.data) as { tool?: string; label?: string };
          tool = d.tool || "";
          label = d.label;
        } catch {
          /* tolerate */
        }
        updateTools((tools) => [...tools, { tool, label, status: "running" }]);
      } else if (frame.event === "response.tool_call.completed") {
        let tool = "";
        let duration_ms: number | undefined;
        try {
          const d = JSON.parse(frame.data) as { tool?: string; duration_ms?: number };
          tool = d.tool || "";
          duration_ms = d.duration_ms;
        } catch {
          /* tolerate */
        }
        settleTool(tool, { status: "ok", duration_ms });
      } else if (frame.event === "response.tool_call.failed") {
        let tool = "";
        let error: string | undefined;
        try {
          const d = JSON.parse(frame.data) as { tool?: string; error?: string | { message?: string } };
          tool = d.tool || "";
          error = typeof d.error === "string" ? d.error : d.error?.message;
        } catch {
          /* tolerate */
        }
        settleTool(tool, { status: "error", error });
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
          ...(files.length ? { files: files.map((f) => f.path) } : {}),
          ...(sessionRef.current ? { session_id: sessionRef.current } : {}),
          // Only meaningful on a new thread; the route ignores it once a session exists.
          ...(opts?.onboarding && !sessionRef.current ? { onboarding: true } : {}),
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
        setMessages((m) => {
          const last = m[m.length - 1];
          // Drop the empty placeholder, but keep it if it recorded any tool activity.
          return last && last.content === "" && !last.tools?.length ? m.slice(0, -1) : m;
        });
      }
      if (isNewSession) refreshSessions();
      if (assembled && !failed) wfRef.current(assembled);
    } catch (e) {
      if (!controller.signal.aborted && mountedRef.current) {
        toast.error((e as Error).message);
        setMessages((m) => {
          const last = m[m.length - 1];
          // Drop the empty placeholder, but keep it if it recorded any tool activity.
          return last && last.content === "" && !last.tools?.length ? m.slice(0, -1) : m;
        });
      }
    } finally {
      if (mountedRef.current) {
        setStreaming(false);
        setActivity("");
      }
    }
  }, [agentId, input, streaming, uploading, attachments, refreshSessions]);

  function newChat() {
    sessionRef.current = null;
    localStorage.removeItem(sessionKey(agentId));
    setActiveSession(null);
    setMessages([]);
    setAttachments([]);
  }

  const uploadFiles = useCallback(
    async (list: FileList | null) => {
      const picked = list ? Array.from(list) : [];
      if (picked.length === 0) return;
      setUploading(true);
      try {
        for (const file of picked) {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch(`/api/agents/${agentId}/files`, { method: "POST", body: fd });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as {
              error?: { message?: string };
            } | null;
            throw new Error(body?.error?.message || `Couldn't upload ${file.name}`);
          }
          const data = (await res.json()) as { path: string; name: string };
          if (mountedRef.current) {
            setAttachments((a) => [...a, { path: data.path, name: data.name }]);
          }
        }
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        if (mountedRef.current) setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [agentId]
  );

  function removeAttachment(path: string) {
    setAttachments((a) => a.filter((f) => f.path !== path));
  }

  const workspaceId = agent?.workspace_id ?? null;

  const refreshWorkflows = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const d = await apiFetch<{ automations: Automation[] }>(
        `/api/workspaces/${workspaceId}/automations`
      );
      if (mountedRef.current) setWorkflows(d.automations.filter((a) => a.agent37_id === agentId));
    } catch {
      /* panel is best-effort */
    }
  }, [workspaceId, agentId]);

  const loadKb = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const d = await apiFetch<{ content: string }>(`/api/workspaces/${workspaceId}/knowledge`);
      if (mountedRef.current) {
        setKb(d.content);
        setKbSaved(d.content);
        setKbLoaded(true);
      }
    } catch {
      /* panel is best-effort */
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) refreshWorkflows();
  }, [workspaceId, refreshWorkflows]);

  useEffect(() => {
    if (openItem?.type === "knowledge" && !kbLoaded) loadKb();
  }, [openItem, loadKb, kbLoaded]);

  async function saveKb() {
    if (!workspaceId) return;
    setKbSaving(true);
    try {
      await apiFetch(`/api/workspaces/${workspaceId}/knowledge`, {
        method: "PUT",
        body: JSON.stringify({ content: kb }),
      });
      setKbSaved(kb);
      toast.success("Saved — the agent will use this.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setKbSaving(false);
    }
  }

  // If the agent's reply contains a ```workflow {json}``` block, turn it into a
  // real saved workflow (using the browser's session), then reveal it in the panel.
  const maybeCreateWorkflow = useCallback(
    async (text: string) => {
      if (!workspaceId) return;
      const m = text.match(/```(?:workflow|json)?\s*(\{[\s\S]*?\})\s*```/i);
      if (!m) return;
      let spec: {
        name?: string;
        trigger?: string;
        cadence?: string;
        steps?: { title?: string; instructions?: string }[];
      };
      try {
        spec = JSON.parse(m[1]);
      } catch {
        return;
      }
      if (!spec.name || !Array.isArray(spec.steps) || spec.steps.length === 0) return;
      try {
        const { automation } = await apiFetch<{ automation: { id: string } }>(
          `/api/workspaces/${workspaceId}/automations`,
          {
            method: "POST",
            body: JSON.stringify({
              agent37_id: agentId,
              name: spec.name,
              steps: spec.steps,
              trigger_type: spec.trigger === "webhook" ? "webhook" : "schedule",
              cadence: spec.trigger === "webhook" ? undefined : spec.cadence || "daily",
            }),
          }
        );
        if (!mountedRef.current) return;
        // Clean the raw JSON block out of the visible message.
        setMessages((msgs) => {
          const next = [...msgs];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === "assistant" && next[i].content.includes(m[0])) {
              next[i] = { ...next[i], content: next[i].content.replace(m[0], "").trim() };
              break;
            }
          }
          return next;
        });
        toast.success(`Workflow created: ${spec.name}`);
        setOpenItem({ type: "workflow", id: automation.id });
        setHighlightWorkflowId(automation.id);
        await refreshWorkflows();
        setTimeout(() => mountedRef.current && setHighlightWorkflowId(null), 2500);
      } catch (e) {
        toast.error(`Couldn't save the workflow: ${(e as Error).message}`);
      }
    },
    [workspaceId, agentId, refreshWorkflows]
  );

  useEffect(() => {
    wfRef.current = maybeCreateWorkflow;
  }, [maybeCreateWorkflow]);

  const agentName = agent?.name || "Agent";
  const running = agent?.status === "running" || agent?.status === "sleeping";

  return (
    <div
      className={cn(
        "flex w-full",
        standalone ? "h-screen" : "h-[calc(100vh-3rem)] md:h-[calc(100vh-3.5rem)]"
      )}
    >
      {/* LEFT SIDEBAR — chats, workspace, workflows (click to open on the right) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-muted/20 md:flex">
        <div className="flex items-center gap-2 border-b px-3 py-3">
          <Link
            href="/dashboard"
            className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="truncate text-sm font-semibold">{agentName}</span>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={newChat}
            disabled={streaming}
          >
            <Plus className="h-4 w-4" /> New chat
          </Button>

          {/* Chats */}
          <div className="space-y-0.5">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Chats
            </p>
            {sessions.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">No chats yet</p>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={streaming}
                  onClick={() => loadSession(s.id)}
                  className={cn(
                    "block w-full truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    s.id === activeSession ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-accent/60",
                    streaming && "cursor-not-allowed opacity-60"
                  )}
                >
                  {s.title || s.preview || "Untitled chat"}
                </button>
              ))
            )}
          </div>

          {/* Workspace */}
          <div className="space-y-0.5">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Workspace
            </p>
            <button
              type="button"
              onClick={() => setOpenItem({ type: "knowledge" })}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                openItem?.type === "knowledge"
                  ? "bg-secondary font-medium"
                  : "text-muted-foreground hover:bg-accent/60"
              )}
            >
              <BookOpen className="h-4 w-4 shrink-0" /> Knowledge base
            </button>
          </div>

          {/* Workflows */}
          <div className="space-y-0.5">
            <div className="flex items-center justify-between px-2 pb-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Workflows
              </p>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={refreshWorkflows}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Refresh workflows"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <Link
                  href="/dashboard/automations"
                  target="_blank"
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="New workflow"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
            {workflows === null ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">Loading…</p>
            ) : workflows.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">No workflows</p>
            ) : (
              workflows.map((w, idx) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setOpenItem({ type: "workflow", id: w.id })}
                  style={{ animationDelay: `${idx * 40}ms` }}
                  className={cn(
                    "flex w-full animate-fade-up items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    openItem?.type === "workflow" && openItem.id === w.id
                      ? "bg-secondary font-medium"
                      : "text-muted-foreground hover:bg-accent/60",
                    w.id === highlightWorkflowId && "animate-highlight"
                  )}
                >
                  <Zap className="h-4 w-4 shrink-0" />
                  <span className="truncate">{w.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* CENTER — conversation */}
      <div className="flex min-w-0 flex-1 flex-col px-4">
        <div className="flex items-center justify-between border-b py-3">
          <div>
            <h1 className="font-semibold leading-tight">{agentName}</h1>
            <p className="text-xs text-muted-foreground">
              {loading ? "Loading…" : running ? "Online" : agent?.status ?? "unknown"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={newChat} disabled={streaming} className="md:hidden">
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto py-6">
          {messages.length === 0 && !loading && (
            <div className="flex h-full items-center justify-center">
              <div className="w-full max-w-md animate-pop text-center">
                <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Ask {agentName} anything — it can browse, write, code, and work with files.
                  Your chats, workflows, and knowledge are in the sidebar; open any of them to
                  see it here alongside the chat.
                </p>

                <button
                  type="button"
                  disabled={streaming}
                  onClick={() => send(GET_STARTED_KICKOFF, { onboarding: true })}
                  className="group mt-6 flex w-full items-center gap-3 rounded-2xl bg-primary px-5 py-4 text-left text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">Get started</span>
                    <span className="mt-0.5 block text-xs text-primary-foreground/80">
                      Answer a couple of quick questions and {agentName} will find what it can
                      take off your plate.
                    </span>
                  </span>
                </button>

                <p className="mt-6 text-xs font-medium text-muted-foreground">Or jump right in</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
            <div
              key={i}
              className={cn("animate-fade-up", m.role === "user" ? "flex justify-end" : "flex justify-start")}
            >
              {m.role === "user" ? (
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
                  {m.content}
                </div>
              ) : (
                <div className="max-w-[85%] rounded-2xl rounded-bl-md border bg-muted/40 px-4 py-2.5 text-sm leading-relaxed shadow-sm">
                  {m.tools && m.tools.length > 0 && <ToolList tools={m.tools} />}
                  {m.content ? (
                    <div className={cn(streaming && i === messages.length - 1 && "stream-caret")}>
                      <Markdown content={m.content} />
                    </div>
                  ) : streaming && i === messages.length - 1 && !m.tools?.length ? (
                    <span className="shimmer inline-block h-4 w-24 rounded" />
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
          className="flex flex-col gap-2 border-t pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {(attachments.length > 0 || uploading) && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((f) => (
                <span
                  key={f.path}
                  className="flex items-center gap-1.5 rounded-lg border bg-muted/50 py-1 pl-2.5 pr-1 text-xs"
                >
                  <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="max-w-[12rem] truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(f.path)}
                    disabled={streaming}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {uploading && (
                <span className="flex items-center gap-1.5 rounded-lg border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Uploading…
                </span>
              )}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => uploadFiles(e.target.files)}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-11 w-11 shrink-0 rounded-xl"
              disabled={streaming || uploading}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
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
            <Button
              type="submit"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl"
              disabled={streaming || uploading || (!input.trim() && attachments.length === 0)}
              aria-label="Send message"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>

      {/* RIGHT PANEL — the opened item (a workflow map or the knowledge base) */}
      {openItem && (
        <aside className="hidden w-[26rem] shrink-0 animate-fade-in flex-col border-l bg-muted/10 md:flex">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {openItem.type === "workflow" ? (
                <Zap className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <BookOpen className="h-4 w-4 shrink-0 text-primary" />
              )}
              <span className="truncate text-sm font-semibold">
                {openItem.type === "workflow"
                  ? (workflows ?? []).find((w) => w.id === openItem.id)?.name ?? "Workflow"
                  : "Knowledge base"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpenItem(null)}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {openItem.type === "knowledge" ? (
              <div className="flex h-full flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  What {agentName} knows about your company. It uses this in every chat.
                </p>
                <textarea
                  value={kb}
                  onChange={(e) => setKb(e.target.value)}
                  placeholder={kbLoaded ? "Tell the agent about your business…" : "Loading…"}
                  disabled={!kbLoaded}
                  className="min-h-[320px] flex-1 resize-none rounded-lg border bg-background p-3 text-xs leading-relaxed focus:border-ring focus:outline-none"
                />
                <Button size="sm" onClick={saveKb} disabled={kbSaving || kb === kbSaved || !kbLoaded}>
                  {kbSaving ? "Saving…" : kb === kbSaved ? "Saved" : "Save"}
                </Button>
              </div>
            ) : (
              (() => {
                const wf = (workflows ?? []).find((w) => w.id === openItem.id);
                if (!wf)
                  return <p className="text-sm text-muted-foreground">Workflow not found.</p>;
                const steps =
                  wf.steps && wf.steps.length > 0
                    ? wf.steps
                    : [{ title: wf.name, instructions: wf.instructions }];
                const cadenceLabel =
                  wf.trigger_type === "schedule"
                    ? { hourly: "Every hour", daily: "Every day", weekly: "Every week" }[
                        wf.cadence ?? "daily"
                      ] ?? "Scheduled"
                    : "Webhook";
                return (
                  <div className="mx-auto max-w-sm">
                    {/* Start node */}
                    <div className="animate-fade-up rounded-xl border bg-background shadow-sm">
                      <div className="flex items-center gap-2 border-b px-3 py-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                          {wf.trigger_type === "schedule" ? (
                            <Clock className="h-3.5 w-3.5" />
                          ) : (
                            <Webhook className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <span className="text-sm font-medium">Start</span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="text-muted-foreground">Trigger</span>
                        <span className="font-medium">{cadenceLabel}</span>
                      </div>
                    </div>

                    {steps.map((s, i) => (
                      <div key={i}>
                        <div className="flex justify-center py-1.5">
                          <div className="h-5 w-px bg-border" />
                        </div>
                        <div
                          style={{ animationDelay: `${(i + 1) * 60}ms` }}
                          className="animate-fade-up rounded-xl border bg-background shadow-sm"
                        >
                          <div className="flex items-center gap-2 border-b px-3 py-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                              {i + 1}
                            </span>
                            <span className="truncate text-sm font-medium">{s.title}</span>
                          </div>
                          <div className="line-clamp-4 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                            {s.instructions}
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className="mt-4 flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {wf.tested_at ? "Tested · ready to run" : "Not tested yet"}
                      </span>
                      <Link
                        href="/dashboard/automations"
                        target="_blank"
                        className="font-medium text-primary underline underline-offset-2"
                      >
                        Open in builder
                      </Link>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
