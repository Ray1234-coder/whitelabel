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
import type { Automation, MergedAgent, WorkflowStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface StepResult {
  title: string;
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
  trigger_type: "schedule" | "webhook";
  cadence: "hourly" | "daily" | "weekly";
  steps: WorkflowStep[];
}

const CADENCES = [
  { id: "hourly", label: "Every hour" },
  { id: "daily", label: "Every day" },
  { id: "weekly", label: "Every week" },
] as const;

function blankDraft(agentId: string): Draft {
  return {
    id: null,
    name: "",
    agent37_id: agentId,
    trigger_type: "schedule",
    cadence: "daily",
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
      steps:
        a.steps && a.steps.length > 0
          ? a.steps.map((s) => ({ title: s.title, instructions: s.instructions }))
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

  function setStep(i: number, p: Partial<WorkflowStep>) {
    setDraft((d) => {
      if (!d) return d;
      const steps = d.steps.map((s, idx) => (idx === i ? { ...s, ...p } : s));
      return { ...d, steps };
    });
    setDirty(true);
    setTested(false);
    setResults(null);
  }

  function addStep() {
    setDraft((d) => (d ? { ...d, steps: [...d.steps, { title: `Step ${d.steps.length + 1}`, instructions: "" }] } : d));
    setDirty(true);
    setTested(false);
  }

  function removeStep(i: number) {
    setDraft((d) => (d && d.steps.length > 1 ? { ...d, steps: d.steps.filter((_, idx) => idx !== i) } : d));
    setDirty(true);
    setTested(false);
  }

  function moveStep(i: number, dir: -1 | 1) {
    setDraft((d) => {
      if (!d) return d;
      const j = i + dir;
      if (j < 0 || j >= d.steps.length) return d;
      const steps = [...d.steps];
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...d, steps };
    });
    setDirty(true);
    setTested(false);
  }

  async function save(): Promise<string | null> {
    if (!current || !draft) return null;
    if (!draft.name.trim()) {
      toast.error("Give your workflow a name.");
      return null;
    }
    if (!draft.steps.some((s) => s.instructions.trim())) {
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
            }),
          }
        );
        setDraft((d) => (d ? { ...d, id: automation.id } : d));
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
              <button
                type="button"
                onClick={() => patchDraft({ trigger_type: "schedule" })}
                className={cn(
                  "rounded-md border px-2 py-1",
                  draft.trigger_type === "schedule" ? "border-primary bg-primary/5" : "hover:bg-accent/40"
                )}
              >
                On a schedule
              </button>
              <button
                type="button"
                onClick={() => patchDraft({ trigger_type: "webhook" })}
                className={cn(
                  "rounded-md border px-2 py-1",
                  draft.trigger_type === "webhook" ? "border-primary bg-primary/5" : "hover:bg-accent/40"
                )}
              >
                On an event (webhook)
              </button>
              {draft.trigger_type === "schedule" && (
                <select
                  value={draft.cadence}
                  onChange={(e) => patchDraft({ cadence: e.target.value as Draft["cadence"] })}
                  className="ml-auto rounded-md border bg-background px-2 py-1"
                >
                  {CADENCES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Step nodes */}
          {draft.steps.map((s, i) => {
            const res = results?.[i];
            return (
              <div key={i}>
                <Connector />
                <div className="mx-auto max-w-xl rounded-lg border bg-background p-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {i + 1}
                    </span>
                    <Input
                      value={s.title}
                      onChange={(e) => setStep(i, { title: e.target.value })}
                      className="h-8 border-0 px-1 text-sm font-medium focus-visible:ring-0"
                    />
                    {res && (
                      <span className="ml-auto flex items-center gap-1 text-xs">
                        {res.status === "ok" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : res.status === "error" ? (
                          <XCircle className="h-4 w-4 text-red-600" />
                        ) : (
                          <span className="text-muted-foreground">skipped</span>
                        )}
                      </span>
                    )}
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => moveStep(i, -1)}
                        disabled={i === 0}
                        className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                        aria-label="Move up"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStep(i, 1)}
                        disabled={i === draft.steps.length - 1}
                        className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                        aria-label="Move down"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeStep(i)}
                        disabled={draft.steps.length === 1}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-red-600 disabled:opacity-30"
                        aria-label="Remove step"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={s.instructions}
                    onChange={(e) => setStep(i, { instructions: e.target.value })}
                    rows={2}
                    placeholder="What should the agent do in this step? (plain English)"
                    className="mt-2 w-full resize-none rounded-md border bg-background px-2 py-1.5 text-sm focus:border-ring focus:outline-none"
                  />
                  {res && (res.output || res.status === "error") && (
                    <div
                      className={cn(
                        "mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border p-2 text-xs",
                        res.status === "error" ? "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400" : "bg-muted/40 text-muted-foreground"
                      )}
                    >
                      {res.output || "(failed)"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <Connector />
          <div className="mx-auto flex max-w-xl justify-center">
            <Button variant="outline" size="sm" onClick={addStep}>
              <Plus className="h-4 w-4" />
              Add step
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
                      aria-label="Copy webhook URL"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/api/hooks/${a.webhook_token}`);
                        toast.success("Webhook URL copied");
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
