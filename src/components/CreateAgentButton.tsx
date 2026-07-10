"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { AGENT_TYPES, SHAPE_PRESETS, monthlyComputeUsd } from "@/config/agents";
import { cn } from "@/lib/utils";
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

const DEFAULT_TEMPLATE =
  AGENT_TYPES.find((a) => a.recommended)?.template ?? AGENT_TYPES[0].template;

export function CreateAgentButton({
  workspaceId,
  onCreated,
}: {
  workspaceId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [shapeId, setShapeId] = useState(SHAPE_PRESETS[0].id);
  const [cap, setCap] = useState("5");

  const shape = SHAPE_PRESETS.find((s) => s.id === shapeId) ?? SHAPE_PRESETS[0];
  const computeCost = monthlyComputeUsd(shape.cpu, shape.memory, shape.disk);

  async function create() {
    setBusy(true);
    try {
      const capNum = Math.max(0, Number(cap) || 0);
      await apiFetch("/api/agents", {
        method: "POST",
        body: JSON.stringify({
          workspace_id: workspaceId,
          template,
          shape: shapeId,
          monthly_cap_usd: capNum,
        }),
      });
      toast.success("Agent is provisioning");
      setOpen(false);
      onCreated();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Create agent
      </Button>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create agent</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Agent type */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Agent type</p>
              <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Agent type">
                {AGENT_TYPES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setTemplate(a.template)}
                    aria-pressed={template === a.template}
                    className={cn(
                      "rounded-lg border bg-background p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      template === a.template
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border hover:bg-accent/40",
                      busy ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium leading-none">{a.label}</p>
                      {a.recommended && (
                        <span className="text-xs text-muted-foreground">Recommended</span>
                      )}
                      {template === a.template && (
                        <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">{a.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Size / resources */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Size</p>
              <div className="grid gap-2" role="group" aria-label="Agent size">
                {SHAPE_PRESETS.map((s) => {
                  const cost = monthlyComputeUsd(s.cpu, s.memory, s.disk);
                  const selected = shapeId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={busy}
                      onClick={() => setShapeId(s.id)}
                      aria-pressed={selected}
                      className={cn(
                        "flex items-center justify-between rounded-lg border bg-background p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-border hover:bg-accent/40",
                        busy ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                      )}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium leading-none">{s.label}</p>
                          {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {s.cpu} vCPU · {s.memory} GB RAM · {s.disk} GB disk — {s.blurb}
                        </p>
                      </div>
                      <span className="shrink-0 pl-3 text-right text-sm font-medium tabular-nums">
                        ${cost.toFixed(2)}
                        <span className="block text-[10px] font-normal text-muted-foreground">
                          /mo running
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Monthly AI budget */}
            <div className="space-y-2">
              <Label htmlFor="cap">Monthly AI budget (per agent)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="cap"
                  type="number"
                  min={0}
                  step={1}
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                  className="pl-6"
                  disabled={busy}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Caps the agent&apos;s LLM, search, and tool spend each month. It stops using
                paid AI once this is hit; set 0 to disable AI entirely.
              </p>
            </div>

            {/* Cost summary */}
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Compute while running</span>
                <span className="tabular-nums text-foreground">~${computeCost.toFixed(2)}/mo</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span>Stopped (disk only)</span>
                <span className="tabular-nums text-foreground">
                  ~${(shape.disk * 0.09).toFixed(2)}/mo
                </span>
              </div>
              <div className="mt-1 flex justify-between">
                <span>AI usage</span>
                <span className="tabular-nums text-foreground">up to ${Math.max(0, Number(cap) || 0)}/mo</span>
              </div>
              <p className="mt-2 border-t pt-2">
                Metered per minute from your Agent37 wallet. Stop or delete the agent any time to
                cut the cost.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={create} disabled={busy}>
              {busy ? "Creating..." : "Create agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
