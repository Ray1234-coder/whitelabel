"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  FlaskConical,
  Play,
  Plus,
  Split,
  Trash2,
  Webhook,
  Zap,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { apiFetch } from "@/lib/api";
import { WORKFLOW_RUNS_PER_DAY } from "@/config/agents";
import { isSplitNode, type Automation, type MergedAgent, type WorkflowNode, type WorkflowStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface StepResult {
  key: string;
  title: string;
  branch?: string;
  status: "ok" | "error" | "skipped";
  output: string;
}
interface RunResult {
  status: string;
  detail: string;
  steps: StepResult[];
}

interface Draft {
  id: string | null;
  name: string;
  agent37_id: string;
  trigger_type: "schedule" | "webhook" | "event";
  cadence: "hourly" | "daily" | "weekly";
  event_source: string;
  event_filter: string;
  webhook_token: string | null;
  steps: WorkflowNode[];
}

// Soft accent palette (sim-style): mostly-white cards, one colorful chip each.
const HUES = [
  { chip: "bg-blue-500/10 text-blue-600", ring: "ring-blue-200" },
  { chip: "bg-amber-500/10 text-amber-600", ring: "ring-amber-200" },
  { chip: "bg-emerald-500/10 text-emerald-600", ring: "ring-emerald-200" },
  { chip: "bg-rose-500/10 text-rose-600", ring: "ring-rose-200" },
  { chip: "bg-violet-500/10 text-violet-600", ring: "ring-violet-200" },
] as const;
const hue = (i: number) => HUES[i % HUES.length];

const CADENCES = [
  { id: "hourly", label: "Every hour" },
  { id: "daily", label: "Every day" },
  { id: "weekly", label: "Every week" },
] as const;

// Provider events, in plain language, for the event-trigger picker.
const EVENT_SOURCES = [
  { id: "stripe", label: "Stripe" },
  { id: "slack", label: "Slack" },
] as const;

const PROVIDER_EVENTS: Record<string, { id: string; label: string }[]> = {
  stripe: [
    { id: "", label: "Any Stripe event" },
    { id: "payment_intent.succeeded", label: "Payment succeeded" },
    { id: "checkout.session.completed", label: "Checkout completed" },
    { id: "invoice.paid", label: "Invoice paid" },
    { id: "invoice.payment_failed", label: "Payment failed" },
    { id: "customer.subscription.created", label: "New subscription" },
    { id: "customer.subscription.deleted", label: "Subscription canceled" },
  ],
  slack: [
    { id: "", label: "Any Slack event" },
    { id: "message", label: "New message in a channel" },
    { id: "app_mention", label: "Someone mentions the app" },
    { id: "reaction_added", label: "Reaction added" },
    { id: "member_joined_channel", label: "Someone joins a channel" },
  ],
};

function blankDraft(agentId: string): Draft {
  return {
    id: null,
    name: "",
    agent37_id: agentId,
    trigger_type: "schedule",
    cadence: "daily",
    event_source: "stripe",
    event_filter: "",
    webhook_token: null,
    steps: [{ title: "Step 1", instructions: "" }],
  };
}

// A downward connector between two nodes on the map.
function Connector() {
  return (
    <div className="flex justify-center py-1">
      <div className="flex flex-col items-center text-muted-foreground/50">
        <div className="h-4 w-px bg-border" />
        <ChevronDown className="-mt-1 h-4 w-4" />
      </div>
    </div>
  );
}

export function AutomationsView() {
  const { current } = useWorkspace();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [agents, setAgents] = useState<MergedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "edit">("list");

  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tested, setTested] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<StepResult[] | null>(null);
  const [stripeConn, setStripeConn] = useState<{ available: boolean; connected: boolean; account: string | null } | null>(null);

  // One-time toast when returning from the Stripe connect flow.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("stripe");
    if (!q) return;
    if (q === "connected") toast.success("Stripe connected — your workflows can now react to your payments.");
    else if (q === "unavailable") toast.error("Stripe connections aren't switched on yet — ask your admin.");
    else if (q === "denied") toast("Stripe connection was canceled.");
    else toast.error("Stripe connection didn't complete — try again.");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const refreshStripeConn = useCallback(async () => {
    if (!current) return;
    try {
      const d = await apiFetch<{ available: boolean; connected: boolean; account: string | null }>(
        `/api/workspaces/${current.id}/stripe/connection`
      );
      setStripeConn(d);
    } catch {
      /* builder works without it */
    }
  }, [current]);

  useEffect(() => {
    if (draft?.trigger_type === "event" && draft.event_source === "stripe" && stripeConn === null) {
      refreshStripeConn();
    }
  }, [draft?.trigger_type, draft?.event_source, stripeConn, refreshStripeConn]);

  const load = useCallback(async () => {
    if (!current) return;
    try {
      const [a, ag] = await Promise.all([
        apiFetch<{ automations: Automation[] }>(`/api/workspaces/${current.id}/automations`),
        apiFetch<{ agents: MergedAgent[] }>(`/api/agents?workspace=${current.id}`),
      ]);
      setAutomations(a.automations);
      setAgents(ag.agents);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [current]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  function openNew() {
    if (agents.length === 0) return;
    setDraft(blankDraft(agents[0].agent37_id));
    setResults(null);
    setDirty(true); // new workflow must be saved before testing
    setTested(false);
    setView("edit");
  }

  function openExisting(a: Automation) {
    setDraft({
      id: a.id,
      name: a.name,
      agent37_id: a.agent37_id,
      trigger_type: a.trigger_type,
      cadence: (a.cadence as Draft["cadence"]) || "daily",
      event_source: a.event_source || "stripe",
      event_filter: a.event_filter || "",
      webhook_token: a.webhook_token,
      steps:
        a.steps && a.steps.length > 0
          ? (JSON.parse(JSON.stringify(a.steps)) as WorkflowNode[])
          : [{ title: "Step 1", instructions: a.instructions }],
    });
    setResults(null);
    setDirty(false);
    setTested(!!a.tested_at);
    setView("edit");
  }

  function patchDraft(p: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setDirty(true);
    setTested(false);
    setResults(null);
  }

  // All node edits go through this: deep-copies steps, applies fn, marks dirty.
  function editNodes(fn: (steps: WorkflowNode[]) => WorkflowNode[]) {
    setDraft((d) => {
      if (!d) return d;
      const steps = fn(JSON.parse(JSON.stringify(d.steps)) as WorkflowNode[]);
      return { ...d, steps };
    });
    setDirty(true);
    setTested(false);
    setResults(null);
  }

  function setStep(i: number, p: Partial<WorkflowStep>) {
    editNodes((steps) => {
      const n = steps[i];
      if (n && !isSplitNode(n)) steps[i] = { ...n, ...p };
      return steps;
    });
  }

  function setBranchStep(i: number, bi: number, si: number, p: Partial<WorkflowStep>) {
    editNodes((steps) => {
      const n = steps[i];
      if (n && isSplitNode(n) && n.branches[bi]?.steps[si]) {
        n.branches[bi].steps[si] = { ...n.branches[bi].steps[si], ...p };
      }
      return steps;
    });
  }

  function addStep() {
    editNodes((steps) => [...steps, { title: `Step ${steps.length + 1}`, instructions: "" }]);
  }

  function addSplit() {
    editNodes((steps) => [
      ...steps,
      {
        branches: [
          { title: "Branch 1", steps: [{ title: "Step 1", instructions: "" }] },
          { title: "Branch 2", steps: [{ title: "Step 1", instructions: "" }] },
        ],
      },
    ]);
  }

  function addBranch(i: number) {
    editNodes((steps) => {
      const n = steps[i];
      if (n && isSplitNode(n) && n.branches.length < 3) {
        n.branches.push({ title: `Branch ${n.branches.length + 1}`, steps: [{ title: "Step 1", instructions: "" }] });
      }
      return steps;
    });
  }

  function setBranchTitle(i: number, bi: number, title: string) {
    editNodes((steps) => {
      const n = steps[i];
      if (n && isSplitNode(n) && n.branches[bi]) n.branches[bi].title = title;
      return steps;
    });
  }

  function removeBranch(i: number, bi: number) {
    editNodes((steps) => {
      const n = steps[i];
      if (n && isSplitNode(n) && n.branches.length > 2) n.branches.splice(bi, 1);
      return steps;
    });
  }

  function addBranchStep(i: number, bi: number) {
    editNodes((steps) => {
      const n = steps[i];
      if (n && isSplitNode(n) && n.branches[bi]) {
        n.branches[bi].steps.push({ title: `Step ${n.branches[bi].steps.length + 1}`, instructions: "" });
      }
      return steps;
    });
  }

  function removeBranchStep(i: number, bi: number, si: number) {
    editNodes((steps) => {
      const n = steps[i];
      if (n && isSplitNode(n) && n.branches[bi] && n.branches[bi].steps.length > 1) {
        n.branches[bi].steps.splice(si, 1);
      }
      return steps;
    });
  }

  function removeStep(i: number) {
    editNodes((steps) => (steps.length > 1 ? steps.filter((_, idx) => idx !== i) : steps));
  }

  function moveStep(i: number, dir: -1 | 1) {
    editNodes((steps) => {
      const j = i + dir;
      if (j < 0 || j >= steps.length) return steps;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return steps;
    });
  }

  async function save(): Promise<string | null> {
    if (!current || !draft) return null;
    if (!draft.name.trim()) {
      toast.error("Give your workflow a name.");
      return null;
    }
    const hasContent = draft.steps.some((n) =>
      isSplitNode(n)
        ? n.branches.some((b) => b.steps.some((s) => s.instructions.trim()))
        : n.instructions.trim()
    );
    if (!hasContent) {
      toast.error("Add at least one step with instructions.");
      return null;
    }
    setSaving(true);
    try {
      if (!draft.id) {
        const { automation } = await apiFetch<{ automation: Automation }>(
          `/api/workspaces/${current.id}/automations`,
          {
            method: "POST",
            body: JSON.stringify({
              agent37_id: draft.agent37_id,
              name: draft.name.trim(),
              steps: draft.steps,
              trigger_type: draft.trigger_type,
              cadence: draft.trigger_type === "schedule" ? draft.cadence : undefined,
              event_source: draft.trigger_type === "event" ? draft.event_source : undefined,
              event_filter: draft.trigger_type === "event" ? draft.event_filter : undefined,
            }),
          }
        );
        setDraft((d) => (d ? { ...d, id: automation.id, webhook_token: automation.webhook_token } : d));
        setDirty(false);
        setTested(false);
        await load();
        return automation.id;
      } else {
        await apiFetch(`/api/workspaces/${current.id}/automations/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: draft.name.trim(), steps: draft.steps }),
        });
        setDirty(false);
        setTested(false);
        await load();
        return draft.id;
      }
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    if (!current || !draft) return;
    let id = draft.id;
    if (dirty || !id) {
      id = await save();
      if (!id) return;
    }
    setTesting(true);
    setResults(null);
    try {
      const r = await apiFetch<RunResult>(`/api/workspaces/${current.id}/automations/${id}/run`, {
        method: "POST",
        body: JSON.stringify({ mode: "test" }),
      });
      setResults(r.steps);
      if (r.status === "ok") {
        setTested(true);
        toast.success("Test passed — you can run this workflow now.");
      } else if (r.status === "limit") {
        toast.error(r.detail);
      } else {
        toast.error("A step failed — check the map and adjust.");
      }
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function run() {
    if (!current || !draft?.id) return;
    setRunning(true);
    try {
      const r = await apiFetch<RunResult>(`/api/workspaces/${current.id}/automations/${draft.id}/run`, {
        method: "POST",
        body: JSON.stringify({ mode: "run" }),
      });
      setResults(r.steps.length ? r.steps : results);
      if (r.status === "ok") toast.success("Ran successfully.");
      else if (r.status === "limit") toast.error(r.detail);
      else if (r.status === "skipped") toast.error(r.detail);
      else toast.error("Run failed — check the map.");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function toggle(a: Automation) {
    if (!current) return;
    try {
      await apiFetch(`/api/workspaces/${current.id}/automations/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !a.enabled }),
      });
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(a: Automation) {
    if (!current) return;
    try {
      await apiFetch(`/api/workspaces/${current.id}/automations/${a.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!current) return <p className="text-sm text-muted-foreground">No workspace selected.</p>;

  // ---------- Builder ----------
  if (view === "edit" && draft) {
    const agentName = agents.find((a) => a.agent37_id === draft.agent37_id)?.name || "the agent";
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setView("list")} aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-semibold tracking-tight">
              {draft.id ? "Edit workflow" : "New workflow"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={save} disabled={saving || testing || running}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="outline" onClick={test} disabled={testing || running || saving}>
              <FlaskConical className="h-4 w-4" />
              {testing ? "Testing…" : "Test"}
            </Button>
            <Button onClick={run} disabled={!tested || dirty || running || testing}>
              <Play className="h-4 w-4" />
              {running ? "Running…" : "Run"}
            </Button>
          </div>
        </div>

        {!tested && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Test the workflow first — <span className="font-medium">Run</span> unlocks once a test passes. You
            get {WORKFLOW_RUNS_PER_DAY} runs per day after that.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={draft.name}
              onChange={(e) => patchDraft({ name: e.target.value })}
              placeholder="e.g. Chase overdue invoices"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Agent</label>
            <select
              value={draft.agent37_id}
              onChange={(e) => patchDraft({ agent37_id: e.target.value })}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {agents.map((a) => (
                <option key={a.agent37_id} value={a.agent37_id}>
                  {a.name || a.agent37_id}
                  {a.plan === "free" ? " (free trial)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* The map */}
        <div className="rounded-xl border bg-muted/20 p-4">
          {/* Trigger node */}
          <div className="mx-auto max-w-xl rounded-lg border bg-background p-3 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium">
              {draft.trigger_type === "schedule" ? (
                <Clock className="h-4 w-4 text-primary" />
              ) : (
                <Webhook className="h-4 w-4 text-primary" />
              )}
              Trigger
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {[
                { id: "schedule", label: "On a schedule" },
                { id: "webhook", label: "With a start link (forms, Calendly, bookings)" },
                { id: "event", label: "On an app event (Stripe, Slack)" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => patchDraft({ trigger_type: t.id as Draft["trigger_type"] })}
                  className={cn(
                    "rounded-md border px-2 py-1",
                    draft.trigger_type === t.id ? "border-primary bg-primary/5" : "hover:bg-accent/40"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {draft.trigger_type === "schedule" && (
              <select
                value={draft.cadence}
                onChange={(e) => patchDraft({ cadence: e.target.value as Draft["cadence"] })}
                className="mt-2 rounded-md border bg-background px-2 py-1 text-xs"
              >
                {CADENCES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
            {draft.trigger_type === "event" && (
              <div className="mt-2 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={draft.event_source}
                    onChange={(e) => patchDraft({ event_source: e.target.value, event_filter: "" })}
                    className="rounded-md border bg-background px-2 py-1 text-xs"
                    aria-label="App"
                  >
                    {EVENT_SOURCES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={draft.event_filter}
                    onChange={(e) => patchDraft({ event_filter: e.target.value })}
                    className="rounded-md border bg-background px-2 py-1 text-xs"
                    aria-label="Which event"
                  >
                    {(PROVIDER_EVENTS[draft.event_source] ?? PROVIDER_EVENTS.stripe).map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {draft.event_source === "slack"
                    ? "Runs the moment this happens in your Slack workspace (needs the Slack app connected — ask your admin)."
                    : "Runs the moment this happens in your own Stripe account."}
                </p>
                {draft.event_source === "stripe" && stripeConn && !stripeConn.connected && (
                  <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-amber-300/60 bg-amber-500/5 p-2">
                    <p className="text-[11px]">
                      {stripeConn.available
                        ? "Connect your Stripe account — one click, sign in, approve. Done."
                        : "Stripe connections aren't switched on yet — ask your admin to finish the one-time setup."}
                    </p>
                    {stripeConn.available && current && (
                      <a
                        href={`/api/workspaces/${current.id}/stripe/connect`}
                        className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90"
                      >
                        Connect Stripe
                      </a>
                    )}
                  </div>
                )}
                {draft.event_source === "stripe" && stripeConn?.connected && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-green-600">
                    <CheckCircle2 className="h-3 w-3" /> Stripe connected
                    <span className="text-muted-foreground">({stripeConn.account})</span>
                  </p>
                )}
              </div>
            )}
            {draft.trigger_type === "webhook" && (
              <div className="mt-2 space-y-1.5 rounded-lg border bg-muted/30 p-2.5">
                <p className="text-xs">
                  Your workflow gets its own <span className="font-semibold">start link</span> — when
                  another tool calls that link, this workflow runs. No coding needed.
                </p>
                {draft.webhook_token ? (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/hooks/${draft.webhook_token}`);
                      toast.success("Start link copied");
                    }}
                    className="flex w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 font-mono text-[11px] text-muted-foreground hover:bg-accent/50"
                  >
                    <Copy className="h-3 w-3 shrink-0" />
                    <span className="truncate">{`${typeof window !== "undefined" ? window.location.origin : ""}/api/hooks/${draft.webhook_token}`}</span>
                  </button>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Save the workflow and your start link appears here.</p>
                )}
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Where to paste it — <span className="font-medium">Calendly:</span> Integrations → Webhooks ·{" "}
                  <span className="font-medium">Typeform:</span> Connect → Webhooks ·{" "}
                  <span className="font-medium">Zapier:</span> a &ldquo;Webhooks&rdquo; action ·{" "}
                  <span className="font-medium">Website form:</span> ask whoever runs your site to send
                  submissions to this link. (Tools call this a &ldquo;webhook&rdquo; — same thing.)
                  Remember to Test the workflow first — the link only works after a passing test.
                </p>
              </div>
            )}
          </div>

          {/* Step nodes */}
          {(() => {
            const resMap = new Map((results ?? []).map((r) => [r.key, r]));
            const statusIcon = (res?: StepResult) =>
              res ? (
                <span className="ml-auto flex items-center gap-1 text-xs">
                  {res.status === "ok" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : res.status === "error" ? (
                    <XCircle className="h-4 w-4 text-red-600" />
                  ) : (
                    <span className="text-muted-foreground">skipped</span>
                  )}
                </span>
              ) : null;
            const output = (res?: StepResult) =>
              res && (res.output || res.status === "error") ? (
                <div
                  className={cn(
                    "mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border p-2 text-xs",
                    res.status === "error"
                      ? "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400"
                      : "bg-muted/40 text-muted-foreground"
                  )}
                >
                  {res.output || "(failed)"}
                </div>
              ) : null;

            return draft.steps.map((node, i) => {
              const topControls = (
                <div className="flex shrink-0 items-center">
                  <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30" aria-label="Move up">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => moveStep(i, 1)} disabled={i === draft.steps.length - 1} className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30" aria-label="Move down">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => removeStep(i)} disabled={draft.steps.length === 1} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-red-600 disabled:opacity-30" aria-label="Remove">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );

              if (isSplitNode(node)) {
                return (
                  <div key={i}>
                    <Connector />
                    <div className="mx-auto max-w-3xl">
                      {/* Split header */}
                      <div className="mx-auto flex max-w-xl items-center gap-2 rounded-xl border bg-background p-3 shadow-sm">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-600">
                          <Split className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-sm font-medium">At the same time</span>
                        <span className="text-xs text-muted-foreground">each branch runs in parallel, then results merge</span>
                        {topControls}
                      </div>
                      {/* Fan-out */}
                      <div className="mx-auto h-3 w-px bg-border" />
                      <div className="mx-auto h-px w-2/3 bg-border" />
                      <div className={cn("grid gap-3 pt-0", node.branches.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
                        {node.branches.map((b, bi) => (
                          <div key={bi} className="flex flex-col">
                            <div className="mx-auto h-3 w-px bg-border" />
                            <div className={cn("flex-1 rounded-xl border bg-background p-2 shadow-sm ring-1 ring-inset", hue(bi).ring)}>
                              <div className="flex items-center gap-1.5 px-1 pb-1">
                                <span className={cn("h-2 w-2 shrink-0 rounded-full", hue(bi).chip.split(" ")[0].replace("/10", ""))} />
                                <Input
                                  value={b.title || ""}
                                  onChange={(e) => setBranchTitle(i, bi, e.target.value)}
                                  placeholder={`Branch ${bi + 1}`}
                                  className="h-7 border-0 px-1 text-xs font-semibold focus-visible:ring-0"
                                />
                                {node.branches.length > 2 && (
                                  <button type="button" onClick={() => removeBranch(i, bi)} className="rounded p-1 text-muted-foreground hover:text-red-600" aria-label="Remove branch">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                              <div className="space-y-2">
                                {b.steps.map((s, si) => {
                                  const res = resMap.get(`${i}.b${bi}.s${si}`);
                                  return (
                                    <div key={si} className="rounded-lg border bg-background p-2">
                                      <div className="flex items-center gap-1.5">
                                        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold", hue(bi).chip)}>
                                          {si + 1}
                                        </span>
                                        <Input
                                          value={s.title}
                                          onChange={(e) => setBranchStep(i, bi, si, { title: e.target.value })}
                                          className="h-6 border-0 px-1 text-xs font-medium focus-visible:ring-0"
                                        />
                                        {statusIcon(res)}
                                        {b.steps.length > 1 && (
                                          <button type="button" onClick={() => removeBranchStep(i, bi, si)} className="rounded p-0.5 text-muted-foreground hover:text-red-600" aria-label="Remove step">
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        )}
                                      </div>
                                      <textarea
                                        value={s.instructions}
                                        onChange={(e) => setBranchStep(i, bi, si, { instructions: e.target.value })}
                                        rows={2}
                                        placeholder="What should happen in this branch?"
                                        className="mt-1.5 w-full resize-none rounded-md border bg-background px-2 py-1 text-xs focus:border-ring focus:outline-none"
                                      />
                                      {output(res)}
                                    </div>
                                  );
                                })}
                                <button type="button" onClick={() => addBranchStep(i, bi)} className="w-full rounded-md border border-dashed px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent/40">
                                  + step
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Fan-in */}
                      <div className="mx-auto h-px w-2/3 bg-border" />
                      <div className="mx-auto h-3 w-px bg-border" />
                      {node.branches.length < 3 && (
                        <div className="flex justify-center">
                          <button type="button" onClick={() => addBranch(i)} className="rounded-md border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent/40">
                            + branch
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              const res = resMap.get(`${i}`);
              return (
                <div key={i}>
                  <Connector />
                  <div className="mx-auto max-w-xl rounded-xl border bg-background p-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold", hue(i).chip)}>
                        {i + 1}
                      </span>
                      <Input
                        value={node.title}
                        onChange={(e) => setStep(i, { title: e.target.value })}
                        className="h-8 border-0 px-1 text-sm font-medium focus-visible:ring-0"
                      />
                      {statusIcon(res)}
                      {topControls}
                    </div>
                    <textarea
                      value={node.instructions}
                      onChange={(e) => setStep(i, { instructions: e.target.value })}
                      rows={2}
                      placeholder="What should the agent do in this step? (plain English)"
                      className="mt-2 w-full resize-none rounded-md border bg-background px-2 py-1.5 text-sm focus:border-ring focus:outline-none"
                    />
                    {output(res)}
                  </div>
                </div>
              );
            });
          })()}

          <Connector />
          <div className="mx-auto flex max-w-xl justify-center gap-2">
            <Button variant="outline" size="sm" onClick={addStep}>
              <Plus className="h-4 w-4" />
              Add step
            </Button>
            <Button variant="outline" size="sm" onClick={addSplit}>
              <Split className="h-4 w-4" />
              Add split
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- List ----------
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Map out what an agent should do, test it, then run it — on a schedule or from an event.
          </p>
        </div>
        <Button onClick={openNew} disabled={agents.length === 0}>
          <Plus className="h-4 w-4" />
          New workflow
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : agents.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          Add an agent first — then you can build a workflow for it.
        </div>
      ) : automations.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Zap className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            No workflows yet. Build one, test it, and run it.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((a) => (
            <div key={a.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => openExisting(a)} className="min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{a.name}</p>
                    <Badge variant="secondary" className="gap-1">
                      {a.trigger_type === "schedule" ? (
                        <>
                          <Clock className="h-3 w-3" />
                          {CADENCES.find((c) => c.id === a.cadence)?.label ?? a.cadence}
                        </>
                      ) : (
                        <>
                          <Webhook className="h-3 w-3" />
                          Webhook
                        </>
                      )}
                    </Badge>
                    {a.tested_at ? (
                      <Badge className="gap-1 bg-green-600 hover:bg-green-600">
                        <CheckCircle2 className="h-3 w-3" /> Tested
                      </Badge>
                    ) : (
                      <Badge variant="outline">Not tested</Badge>
                    )}
                    {!a.enabled && <Badge variant="outline">Paused</Badge>}
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {(a.steps?.length ?? 1)} step{(a.steps?.length ?? 1) === 1 ? "" : "s"} ·{" "}
                    {a.last_status ? `last run: ${a.last_status}` : "never run"}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => openExisting(a)}>
                    Open
                  </Button>
                  {a.trigger_type === "webhook" && a.webhook_token && a.tested_at && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Copy start link"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/api/hooks/${a.webhook_token}`);
                        toast.success("Start link copied");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => toggle(a)}>
                    {a.enabled ? "Pause" : "Resume"}
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(a)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
