"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
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
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { WORKFLOW_RUNS_PER_DAY } from "@/config/agents";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "@/config/workflowTemplates";
import { isSplitNode, type Automation, type WorkflowNode, type WorkflowStep } from "@/lib/types";
import { cn } from "@/lib/utils";
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
  trigger_type: "schedule" | "webhook" | "event";
  cadence: "hourly" | "daily" | "weekly";
  event_source: string;
  event_filter: string;
  webhook_token: string | null;
  steps: WorkflowNode[];
}

const HUES = [
  "bg-blue-500/10 text-blue-600",
  "bg-amber-500/10 text-amber-600",
  "bg-emerald-500/10 text-emerald-600",
  "bg-rose-500/10 text-rose-600",
  "bg-violet-500/10 text-violet-600",
] as const;
const hue = (i: number) => HUES[i % HUES.length];

const CADENCES = [
  { id: "hourly", label: "Every hour" },
  { id: "daily", label: "Every day" },
  { id: "weekly", label: "Every week" },
] as const;

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

function draftFrom(a: Automation | null): Draft {
  if (!a) {
    return {
      id: null,
      name: "",
      trigger_type: "schedule",
      cadence: "daily",
      event_source: "stripe",
      event_filter: "",
      webhook_token: null,
      steps: [{ title: "Step 1", instructions: "" }],
    };
  }
  return {
    id: a.id,
    name: a.name,
    trigger_type: a.trigger_type,
    cadence: (a.cadence as Draft["cadence"]) || "daily",
    event_source: a.event_source || "stripe",
    event_filter: a.event_filter || "",
    webhook_token: a.webhook_token,
    steps:
      a.steps && a.steps.length > 0
        ? (JSON.parse(JSON.stringify(a.steps)) as WorkflowNode[])
        : [{ title: "Step 1", instructions: a.instructions }],
  };
}

function Connector() {
  return (
    <div className="flex justify-center py-1">
      <div className="flex flex-col items-center text-muted-foreground/50">
        <div className="h-3 w-px bg-border" />
        <ChevronDown className="-mt-1 h-3.5 w-3.5" />
      </div>
    </div>
  );
}

/**
 * Compact workflow builder for the agent workspace's right panel. Always
 * builds for the agent whose workspace is open — no agent picker, so a new
 * workflow can never land on a different agent by accident.
 */
export function WorkflowBuilder({
  workspaceId,
  agentId,
  automation,
  onSaved,
}: {
  workspaceId: string;
  agentId: string;
  /** null = create a new workflow */
  automation: Automation | null;
  /** Called after create/save/test/run so the parent can refresh its list */
  onSaved: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(automation));
  const [dirty, setDirty] = useState(!automation);
  const [tested, setTested] = useState(!!automation?.tested_at);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<StepResult[] | null>(null);
  const [stripeConn, setStripeConn] = useState<{
    available: boolean;
    connected: boolean;
    account: string | null;
  } | null>(null);
  // Fresh new workflows open on the template gallery first.
  const [showTemplates, setShowTemplates] = useState(automation === null);

  // Re-seed only when a *different* workflow is opened (keyed by id) — list
  // refreshes swap the object identity, and a just-created draft briefly has
  // an id the parent's list doesn't know yet; neither should wipe edits.
  const automationId = automation?.id ?? null;
  const draftIdRef = useRef<string | null>(draft.id);
  useEffect(() => {
    draftIdRef.current = draft.id;
  }, [draft.id]);
  useEffect(() => {
    if (draftIdRef.current === automationId) return;
    setDraft(draftFrom(automation));
    setDirty(!automation);
    setTested(!!automation?.tested_at);
    setResults(null);
    setShowTemplates(automationId === null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automationId]);

  function applyTemplate(t: WorkflowTemplate) {
    setDraft({
      id: null,
      name: t.title,
      trigger_type: t.trigger_type,
      cadence: t.cadence ?? "daily",
      event_source: "stripe",
      event_filter: "",
      webhook_token: null,
      steps: JSON.parse(JSON.stringify(t.steps)) as WorkflowNode[],
    });
    setDirty(true);
    setTested(false);
    setResults(null);
    setShowTemplates(false);
  }

  const refreshStripeConn = useCallback(async () => {
    try {
      const d = await apiFetch<{ available: boolean; connected: boolean; account: string | null }>(
        `/api/workspaces/${workspaceId}/stripe/connection`
      );
      setStripeConn(d);
    } catch {
      /* builder works without it */
    }
  }, [workspaceId]);

  useEffect(() => {
    if (draft.trigger_type === "event" && draft.event_source === "stripe" && stripeConn === null) {
      refreshStripeConn();
    }
  }, [draft.trigger_type, draft.event_source, stripeConn, refreshStripeConn]);

  function patchDraft(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
    setTested(false);
    setResults(null);
  }

  function editNodes(fn: (steps: WorkflowNode[]) => WorkflowNode[]) {
    setDraft((d) => ({
      ...d,
      steps: fn(JSON.parse(JSON.stringify(d.steps)) as WorkflowNode[]),
    }));
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

  const addStep = () =>
    editNodes((steps) => [...steps, { title: `Step ${steps.length + 1}`, instructions: "" }]);

  const addSplit = () =>
    editNodes((steps) => [
      ...steps,
      {
        branches: [
          { title: "Branch 1", steps: [{ title: "Step 1", instructions: "" }] },
          { title: "Branch 2", steps: [{ title: "Step 1", instructions: "" }] },
        ],
      },
    ]);

  function addBranch(i: number) {
    editNodes((steps) => {
      const n = steps[i];
      if (n && isSplitNode(n) && n.branches.length < 3) {
        n.branches.push({
          title: `Branch ${n.branches.length + 1}`,
          steps: [{ title: "Step 1", instructions: "" }],
        });
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
        n.branches[bi].steps.push({
          title: `Step ${n.branches[bi].steps.length + 1}`,
          instructions: "",
        });
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

  const removeStep = (i: number) =>
    editNodes((steps) => (steps.length > 1 ? steps.filter((_, idx) => idx !== i) : steps));

  function moveStep(i: number, dir: -1 | 1) {
    editNodes((steps) => {
      const j = i + dir;
      if (j < 0 || j >= steps.length) return steps;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return steps;
    });
  }

  async function save(): Promise<string | null> {
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
        const { automation: created } = await apiFetch<{ automation: Automation }>(
          `/api/workspaces/${workspaceId}/automations`,
          {
            method: "POST",
            body: JSON.stringify({
              agent37_id: agentId,
              name: draft.name.trim(),
              steps: draft.steps,
              trigger_type: draft.trigger_type,
              cadence: draft.trigger_type === "schedule" ? draft.cadence : undefined,
              event_source: draft.trigger_type === "event" ? draft.event_source : undefined,
              event_filter: draft.trigger_type === "event" ? draft.event_filter : undefined,
            }),
          }
        );
        setDraft((d) => ({ ...d, id: created.id, webhook_token: created.webhook_token }));
        setDirty(false);
        setTested(false);
        onSaved(created.id);
        toast.success("Workflow created");
        return created.id;
      } else {
        await apiFetch(`/api/workspaces/${workspaceId}/automations/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: draft.name.trim(), steps: draft.steps }),
        });
        setDirty(false);
        setTested(false);
        onSaved(draft.id);
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
    let id = draft.id;
    if (dirty || !id) {
      id = await save();
      if (!id) return;
    }
    setTesting(true);
    setResults(null);
    try {
      const r = await apiFetch<RunResult>(
        `/api/workspaces/${workspaceId}/automations/${id}/run`,
        { method: "POST", body: JSON.stringify({ mode: "test" }) }
      );
      setResults(r.steps);
      if (r.status === "ok") {
        setTested(true);
        toast.success("Test passed — you can run this workflow now.");
      } else if (r.status === "limit") {
        toast.error(r.detail);
      } else {
        toast.error("A step failed — check the map and adjust.");
      }
      onSaved(id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function run() {
    if (!draft.id) return;
    setRunning(true);
    try {
      const r = await apiFetch<RunResult>(
        `/api/workspaces/${workspaceId}/automations/${draft.id}/run`,
        { method: "POST", body: JSON.stringify({ mode: "run" }) }
      );
      setResults(r.steps.length ? r.steps : results);
      if (r.status === "ok") toast.success("Ran successfully.");
      else if (r.status === "limit") toast.error(r.detail);
      else if (r.status === "skipped") toast.error(r.detail);
      else toast.error("Run failed — check the map.");
      onSaved(draft.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

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
          "mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-md border p-2 text-xs",
          res.status === "error"
            ? "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400"
            : "bg-muted/40 text-muted-foreground"
        )}
      >
        {res.output || "(failed)"}
      </div>
    ) : null;

  // Template gallery for brand-new workflows: pick a starter or begin blank.
  if (showTemplates && draft.id === null) {
    const leafCount = (steps: WorkflowNode[]) =>
      steps.reduce(
        (n, s) => n + (isSplitNode(s) ? s.branches.reduce((m, b) => m + b.steps.length, 0) : 1),
        0
      );
    return (
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold">Start with a template</p>
          <p className="text-xs text-muted-foreground">
            Real recipes you can adopt in one click — edit anything after.
          </p>
        </div>
        <div className="space-y-2">
          {WORKFLOW_TEMPLATES.map((t, i) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t)}
              style={{ animationDelay: `${i * 45}ms` }}
              className="w-full animate-fade-up rounded-xl border bg-background p-3 text-left shadow-sm transition-colors hover:border-ring hover:bg-accent/30"
            >
              <div className="flex items-center gap-2">
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-base", hue(i))}>
                  {t.icon}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{t.title}</span>
                  <span className="block text-[11px] text-muted-foreground">{t.category}</span>
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{t.blurb}</p>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {t.trigger_type === "schedule" ? (
                  <Clock className="h-3 w-3" />
                ) : (
                  <Webhook className="h-3 w-3" />
                )}
                {t.trigger_type === "schedule"
                  ? t.cadence === "daily"
                    ? "Runs every day"
                    : `Runs ${t.cadence}`
                  : "Starts from a link (form, booking…)"}
                <span>· {leafCount(t.steps)} steps</span>
                {t.steps.some(isSplitNode) && <span>· parallel</span>}
              </p>
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" className="w-full" onClick={() => setShowTemplates(false)}>
          <Plus className="h-3.5 w-3.5" />
          Start from scratch
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={save} disabled={saving || testing || running}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={test} disabled={testing || running || saving}>
          <FlaskConical className="h-3.5 w-3.5" />
          {testing ? "Testing…" : "Test"}
        </Button>
        <Button size="sm" onClick={run} disabled={!tested || dirty || running || testing}>
          <Play className="h-3.5 w-3.5" />
          {running ? "Running…" : "Run"}
        </Button>
      </div>

      {!tested && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
          Test first — <span className="font-medium">Run</span> unlocks once a test passes (
          {WORKFLOW_RUNS_PER_DAY} runs/day).
        </p>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium">Name</label>
        <Input
          value={draft.name}
          onChange={(e) => patchDraft({ name: e.target.value })}
          placeholder="e.g. Chase overdue invoices"
          className="h-8 text-sm"
        />
      </div>

      {/* The map */}
      <div className="rounded-xl border bg-muted/20 p-2.5">
        {/* Trigger node */}
        <div className="rounded-lg border bg-background p-2.5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium">
            {draft.trigger_type === "schedule" ? (
              <Clock className="h-4 w-4 text-primary" />
            ) : (
              <Webhook className="h-4 w-4 text-primary" />
            )}
            Trigger
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            {[
              { id: "schedule", label: "On a schedule" },
              { id: "webhook", label: "With a start link" },
              { id: "event", label: "On an app event" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => patchDraft({ trigger_type: t.id as Draft["trigger_type"] })}
                disabled={!!draft.id}
                className={cn(
                  "rounded-md border px-2 py-1",
                  draft.trigger_type === t.id ? "border-primary bg-primary/5" : "hover:bg-accent/40",
                  draft.id && draft.trigger_type !== t.id && "opacity-40"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {draft.id && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              The trigger is set when a workflow is created.
            </p>
          )}
          {draft.trigger_type === "schedule" && (
            <select
              value={draft.cadence}
              onChange={(e) => patchDraft({ cadence: e.target.value as Draft["cadence"] })}
              disabled={!!draft.id}
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
              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  value={draft.event_source}
                  onChange={(e) => patchDraft({ event_source: e.target.value, event_filter: "" })}
                  disabled={!!draft.id}
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
                  disabled={!!draft.id}
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
              <p className="text-[10px] text-muted-foreground">
                {draft.event_source === "slack"
                  ? "Runs when this happens in your Slack workspace (needs the Slack app connected)."
                  : "Runs when this happens in your own Stripe account."}
              </p>
              {draft.event_source === "stripe" && stripeConn && !stripeConn.connected && (
                <div className="mt-1 space-y-1 rounded-lg border border-amber-300/60 bg-amber-500/5 p-2">
                  <p className="text-[10px]">
                    {stripeConn.available
                      ? "Connect your Stripe account — one click, sign in, approve."
                      : "Stripe connections aren't switched on yet — ask your admin."}
                  </p>
                  {stripeConn.available && (
                    <a
                      href={`/api/workspaces/${workspaceId}/stripe/connect`}
                      className="inline-block rounded-md bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground hover:opacity-90"
                    >
                      Connect Stripe
                    </a>
                  )}
                </div>
              )}
              {draft.event_source === "stripe" && stripeConn?.connected && (
                <p className="mt-1 flex items-center gap-1 text-[10px] text-green-600">
                  <CheckCircle2 className="h-3 w-3" /> Stripe connected
                  <span className="text-muted-foreground">({stripeConn.account})</span>
                </p>
              )}
            </div>
          )}
          {draft.trigger_type === "webhook" && (
            <div className="mt-2 space-y-1.5 rounded-lg border bg-muted/30 p-2">
              <p className="text-[11px]">
                Your workflow gets its own <span className="font-semibold">start link</span> —
                when another tool calls it, this workflow runs.
              </p>
              {draft.webhook_token ? (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/api/hooks/${draft.webhook_token}`
                    );
                    toast.success("Start link copied");
                  }}
                  className="flex w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 font-mono text-[10px] text-muted-foreground hover:bg-accent/50"
                >
                  <Copy className="h-3 w-3 shrink-0" />
                  <span className="truncate">{`${typeof window !== "undefined" ? window.location.origin : ""}/api/hooks/${draft.webhook_token}`}</span>
                </button>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  Save the workflow and your start link appears here.
                </p>
              )}
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Paste it into Calendly, Typeform, Zapier, or a website form (tools call this a
                &ldquo;webhook&rdquo;). The link only works after a passing test.
              </p>
            </div>
          )}
        </div>

        {/* Step nodes */}
        {draft.steps.map((node, i) => {
          const topControls = (
            <div className="flex shrink-0 items-center">
              <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30" aria-label="Move up">
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => moveStep(i, 1)} disabled={i === draft.steps.length - 1} className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30" aria-label="Move down">
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => removeStep(i)} disabled={draft.steps.length === 1} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-red-600 disabled:opacity-30" aria-label="Remove">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );

          if (isSplitNode(node)) {
            return (
              <div key={i}>
                <Connector />
                {/* Split header */}
                <div className="flex items-center gap-2 rounded-xl border bg-background p-2.5 shadow-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-600">
                    <Split className="h-3 w-3" />
                  </span>
                  <span className="text-xs font-medium">At the same time</span>
                  {topControls}
                </div>
                <div className="mx-auto h-2 w-px bg-border" />
                <div className="mx-auto h-px w-3/4 bg-border" />
                <div className="grid grid-cols-2 gap-1.5">
                  {node.branches.map((b, bi) => (
                    <div key={bi} className="flex flex-col">
                      <div className="mx-auto h-2 w-px bg-border" />
                      <div className="flex-1 rounded-lg border bg-background p-1.5 shadow-sm">
                        <div className="flex items-center gap-1 px-0.5 pb-1">
                          <span className={cn("h-2 w-2 shrink-0 rounded-full", ["bg-blue-500", "bg-amber-500", "bg-emerald-500"][bi % 3])} />
                          <Input
                            value={b.title || ""}
                            onChange={(e) => setBranchTitle(i, bi, e.target.value)}
                            placeholder={`Branch ${bi + 1}`}
                            className="h-6 border-0 px-1 text-[11px] font-semibold focus-visible:ring-0"
                          />
                          {node.branches.length > 2 && (
                            <button type="button" onClick={() => removeBranch(i, bi)} className="rounded p-0.5 text-muted-foreground hover:text-red-600" aria-label="Remove branch">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {b.steps.map((s, si) => {
                            const res = resMap.get(`${i}.b${bi}.s${si}`);
                            return (
                              <div key={si} className="rounded-md border bg-background p-1.5">
                                <div className="flex items-center gap-1">
                                  <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-semibold", hue(bi))}>
                                    {si + 1}
                                  </span>
                                  <Input
                                    value={s.title}
                                    onChange={(e) => setBranchStep(i, bi, si, { title: e.target.value })}
                                    className="h-5 border-0 px-1 text-[11px] font-medium focus-visible:ring-0"
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
                                  placeholder="What happens in this branch?"
                                  className="mt-1 w-full resize-none rounded-md border bg-background px-1.5 py-1 text-[11px] focus:border-ring focus:outline-none"
                                />
                                {output(res)}
                              </div>
                            );
                          })}
                          <button type="button" onClick={() => addBranchStep(i, bi)} className="w-full rounded-md border border-dashed px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent/40">
                            + step
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mx-auto h-px w-3/4 bg-border" />
                <div className="mx-auto h-2 w-px bg-border" />
                {node.branches.length < 3 && (
                  <div className="flex justify-center">
                    <button type="button" onClick={() => addBranch(i)} className="rounded-md border border-dashed px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent/40">
                      + branch
                    </button>
                  </div>
                )}
              </div>
            );
          }

          const res = resMap.get(`${i}`);
          return (
            <div key={i}>
              <Connector />
              <div className="rounded-xl border bg-background p-2.5 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold", hue(i))}>
                    {i + 1}
                  </span>
                  <Input
                    value={node.title}
                    onChange={(e) => setStep(i, { title: e.target.value })}
                    className="h-7 border-0 px-1 text-xs font-medium focus-visible:ring-0"
                  />
                  {statusIcon(res)}
                  {topControls}
                </div>
                <textarea
                  value={node.instructions}
                  onChange={(e) => setStep(i, { instructions: e.target.value })}
                  rows={2}
                  placeholder="What should the agent do in this step? (plain English)"
                  className="mt-1.5 w-full resize-none rounded-md border bg-background px-2 py-1 text-xs focus:border-ring focus:outline-none"
                />
                {output(res)}
              </div>
            </div>
          );
        })}

        <Connector />
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={addStep}>
            <Plus className="h-3.5 w-3.5" />
            Add step
          </Button>
          <Button variant="outline" size="sm" onClick={addSplit}>
            <Split className="h-3.5 w-3.5" />
            Add split
          </Button>
        </div>
      </div>
    </div>
  );
}
