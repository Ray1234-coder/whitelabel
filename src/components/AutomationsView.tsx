"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Copy, Play, Plus, Trash2, Webhook, Zap } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { apiFetch } from "@/lib/api";
import type { Automation, MergedAgent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CADENCES = [
  { id: "hourly", label: "Every hour" },
  { id: "daily", label: "Every day" },
  { id: "weekly", label: "Every week" },
] as const;

function fmtWhen(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function AutomationsView() {
  const { current } = useWorkspace();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [agents, setAgents] = useState<MergedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  // New-automation form
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [triggerType, setTriggerType] = useState<"schedule" | "webhook">("schedule");
  const [cadence, setCadence] = useState<"hourly" | "daily" | "weekly">("daily");

  const load = useCallback(async () => {
    if (!current) return;
    try {
      const [a, ag] = await Promise.all([
        apiFetch<{ automations: Automation[] }>(`/api/workspaces/${current.id}/automations`),
        apiFetch<{ agents: MergedAgent[] }>(`/api/agents?workspace=${current.id}`),
      ]);
      setAutomations(a.automations);
      setAgents(ag.agents);
      if (!agentId && ag.agents[0]) setAgentId(ag.agents[0].agent37_id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [current, agentId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function create() {
    if (!current) return;
    if (!name.trim() || !instructions.trim() || !agentId) {
      toast.error("Give it a name, pick an agent, and describe what it should do.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/workspaces/${current.id}/automations`, {
        method: "POST",
        body: JSON.stringify({
          agent37_id: agentId,
          name: name.trim(),
          instructions: instructions.trim(),
          trigger_type: triggerType,
          cadence: triggerType === "schedule" ? cadence : undefined,
        }),
      });
      toast.success("Automation created");
      setOpen(false);
      setName("");
      setInstructions("");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
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

  async function runNow(a: Automation) {
    if (!current) return;
    setRunningId(a.id);
    try {
      const r = await apiFetch<{ status: string; detail: string }>(
        `/api/workspaces/${current.id}/automations/${a.id}/run`,
        { method: "POST" }
      );
      if (r.status === "ok") toast.success("Ran successfully — check the agent's output.");
      else if (r.status === "limit") toast.error("Free trial daily run limit reached.");
      else toast.error(`Run failed: ${r.detail?.slice(0, 120) || "unknown error"}`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunningId(null);
    }
  }

  function webhookUrl(token: string | null) {
    if (!token) return "";
    return `${window.location.origin}/api/hooks/${token}`;
  }

  if (!current) return <p className="text-sm text-muted-foreground">No workspace selected.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
          <p className="text-sm text-muted-foreground">
            Have an agent run on a schedule, or when something happens (via a webhook).
          </p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={agents.length === 0}>
          <Plus className="h-4 w-4" />
          New automation
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : agents.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          Add an agent first — then you can automate it here.
        </div>
      ) : automations.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Zap className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            No automations yet. Create one to have an agent run on a schedule or react to an event.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((a) => (
            <div key={a.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
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
                    {!a.enabled && <Badge variant="outline">Paused</Badge>}
                    {a.last_status && (
                      <span
                        className={cn(
                          "text-xs",
                          a.last_status === "ok" ? "text-green-600" : a.last_status === "error" ? "text-red-600" : "text-muted-foreground"
                        )}
                      >
                        last: {a.last_status} · {fmtWhen(a.last_run_at)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{a.instructions}</p>
                  {a.trigger_type === "webhook" && a.webhook_token && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(webhookUrl(a.webhook_token));
                        toast.success("Webhook URL copied");
                      }}
                      className="mt-2 flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-accent/60"
                    >
                      <Copy className="h-3 w-3" />
                      {`…/api/hooks/${a.webhook_token.slice(0, 10)}…`}
                    </button>
                  )}
                  {a.trigger_type === "schedule" && a.enabled && (
                    <p className="mt-1 text-xs text-muted-foreground">Next run: {fmtWhen(a.next_run_at)}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => runNow(a)} disabled={runningId === a.id}>
                    <Play className="h-4 w-4" />
                    {runningId === a.id ? "Running…" : "Run now"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => toggle(a)}>
                    {a.enabled ? "Pause" : "Resume"}
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Delete automation" onClick={() => remove(a)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New automation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="auto-name">Name</Label>
              <Input
                id="auto-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Chase overdue invoices"
                disabled={busy}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="auto-agent">Agent</Label>
              <select
                id="auto-agent"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                disabled={busy}
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

            <div className="space-y-1.5">
              <Label htmlFor="auto-instructions">What should it do?</Label>
              <textarea
                id="auto-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={4}
                placeholder="Describe the task in plain English, e.g. 'Check the invoices sheet for anything overdue and email a friendly reminder.'"
                disabled={busy}
                className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Trigger</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTriggerType("schedule")}
                  aria-pressed={triggerType === "schedule"}
                  className={cn(
                    "rounded-lg border p-3 text-left text-sm transition-colors",
                    triggerType === "schedule" ? "border-primary bg-primary/5" : "hover:bg-accent/40"
                  )}
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <Clock className="h-4 w-4" /> On a schedule
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">Runs on a cadence you choose.</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTriggerType("webhook")}
                  aria-pressed={triggerType === "webhook"}
                  className={cn(
                    "rounded-lg border p-3 text-left text-sm transition-colors",
                    triggerType === "webhook" ? "border-primary bg-primary/5" : "hover:bg-accent/40"
                  )}
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <Webhook className="h-4 w-4" /> On an event
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Gives you a URL to trigger it from outside.
                  </span>
                </button>
              </div>
            </div>

            {triggerType === "schedule" && (
              <div className="space-y-1.5">
                <Label htmlFor="auto-cadence">How often</Label>
                <select
                  id="auto-cadence"
                  value={cadence}
                  onChange={(e) => setCadence(e.target.value as "hourly" | "daily" | "weekly")}
                  disabled={busy}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {CADENCES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={create} disabled={busy}>
              {busy ? "Creating…" : "Create automation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
