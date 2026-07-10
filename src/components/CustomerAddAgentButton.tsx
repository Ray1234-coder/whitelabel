"use client";

import { useState } from "react";
import { Check, Gift, Headset, Plus } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import {
  AGENT_TYPES,
  FREE_RUNS_PER_DAY,
  SHAPE_PRESETS,
  customerMonthlyUsd,
} from "@/config/agents";
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

// Customer self-serve agent creation. Two plans:
//  - Free trial: one limited agent, no card, capped to a couple of runs/day.
//  - Paid: monthly Stripe subscription (agent provisioned by the webhook).
export function CustomerAddAgentButton({
  workspaceId,
  onCreated,
}: {
  workspaceId: string;
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<"free" | "paid">("free");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [shapeId, setShapeId] = useState(SHAPE_PRESETS[0].id);
  const [cap, setCap] = useState("5");

  const shape = SHAPE_PRESETS.find((s) => s.id === shapeId) ?? SHAPE_PRESETS[0];
  const capNum = Math.max(0, Number(cap) || 0);
  const monthly = customerMonthlyUsd(shape.cpu, shape.memory, shape.disk, capNum);

  async function startFree() {
    setBusy(true);
    try {
      await apiFetch(`/api/workspaces/${workspaceId}/agents/free`, { method: "POST" });
      toast.success("Your free trial agent is being set up.");
      setOpen(false);
      onCreated?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    setBusy(true);
    try {
      const { url } = await apiFetch<{ url: string }>(
        `/api/workspaces/${workspaceId}/billing/checkout`,
        {
          method: "POST",
          body: JSON.stringify({ template, shape: shapeId, monthly_cap_usd: capNum }),
        }
      );
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add agent
      </Button>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add an agent</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Plan */}
            <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Plan">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPlan("free")}
                aria-pressed={plan === "free"}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  plan === "free"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:bg-accent/40"
                )}
              >
                <div className="flex items-center gap-2">
                  <Gift className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium leading-none">Free trial</p>
                  {plan === "free" && <Check className="ml-auto h-4 w-4 text-primary" />}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Build and test a workflow. {FREE_RUNS_PER_DAY} runs/day, no card needed.
                </p>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPlan("paid")}
                aria-pressed={plan === "paid"}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  plan === "paid"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:bg-accent/40"
                )}
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium leading-none">Paid</p>
                  {plan === "paid" && <Check className="ml-auto h-4 w-4 text-primary" />}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Unlimited runs, full size options. Billed monthly.
                </p>
              </button>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
              <Headset className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>
                Every plan includes <span className="font-medium">24/7 customer support</span> — we&apos;ll
                help you get your agent set up and answer questions any time.
              </p>
            </div>

            {plan === "free" ? (
              <div className="space-y-2 rounded-lg border bg-muted/40 p-4 text-sm">
                <p className="font-medium">Your free trial includes</p>
                <ul className="space-y-1.5 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" /> One agent for this workspace
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" /> Build and set up your workflow — no limits
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" /> Run it up to {FREE_RUNS_PER_DAY} times a day
                    (resets daily)
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" /> 24/7 customer support &amp; setup help
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" /> No card required
                  </li>
                </ul>
              </div>
            ) : (
              <>
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
                          "rounded-lg border bg-background p-3 text-left transition-colors",
                          template === a.template
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border hover:bg-accent/40"
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

                {/* Size */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Size</p>
                  <div className="grid gap-2" role="group" aria-label="Agent size">
                    {SHAPE_PRESETS.map((s) => {
                      const price = customerMonthlyUsd(s.cpu, s.memory, s.disk, capNum);
                      const selected = shapeId === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={busy}
                          onClick={() => setShapeId(s.id)}
                          aria-pressed={selected}
                          className={cn(
                            "flex items-center justify-between rounded-lg border bg-background p-3 text-left transition-colors",
                            selected
                              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                              : "border-border hover:bg-accent/40"
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
                            ${price.toFixed(2)}
                            <span className="block text-[10px] font-normal text-muted-foreground">
                              /mo
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* AI budget */}
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
                    How much the agent can spend on AI each month. Included in your price below.
                  </p>
                </div>

                {/* Price */}
                <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium">Your price</span>
                    <span className="tabular-nums text-lg font-semibold">
                      ${monthly.toFixed(2)}
                      <span className="text-xs font-normal text-muted-foreground">/month</span>
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Billed monthly. Cancel any time from the Billing page.
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            {plan === "free" ? (
              <Button onClick={startFree} disabled={busy}>
                {busy ? "Starting…" : "Start free trial"}
              </Button>
            ) : (
              <Button onClick={checkout} disabled={busy}>
                {busy ? "Redirecting…" : `Subscribe — $${monthly.toFixed(2)}/mo`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
