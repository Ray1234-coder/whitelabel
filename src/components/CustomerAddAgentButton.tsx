"use client";

import { useState } from "react";
import { Check, Headset, Plus } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { AGENT_TYPES, SHAPE_PRESETS, customerMonthlyUsd } from "@/config/agents";
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

// Customer self-serve agent creation. Unlike the admin's free create, this goes
// through Stripe Checkout (a monthly subscription); the agent is provisioned by
// the webhook once payment succeeds. Prices shown are the customer price.
export function CustomerAddAgentButton({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [shapeId, setShapeId] = useState(SHAPE_PRESETS[0].id);
  const [cap, setCap] = useState("5");

  const shape = SHAPE_PRESETS.find((s) => s.id === shapeId) ?? SHAPE_PRESETS[0];
  const capNum = Math.max(0, Number(cap) || 0);
  const monthly = customerMonthlyUsd(shape.cpu, shape.memory, shape.disk, capNum);

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
      // Off to Stripe's hosted checkout; we come back to /dashboard/billing.
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
            <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
              <Headset className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>
                Every plan includes <span className="font-medium">24/7 customer support</span> — we&apos;ll
                help you get your agent set up and answer questions any time.
              </p>
            </div>

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

            {/* Size / plan */}
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
                        <p className="mt-1 flex items-center gap-1 text-xs text-primary">
                          <Headset className="h-3 w-3" />
                          24/7 customer support &amp; setup help included
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
                How much the agent can spend on AI (models, search, tools) each month. Included in
                your monthly price below.
              </p>
            </div>

            {/* Price summary */}
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="font-medium">Your price</span>
                <span className="tabular-nums text-lg font-semibold">
                  ${monthly.toFixed(2)}
                  <span className="text-xs font-normal text-muted-foreground">/month</span>
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Billed monthly. Cancel any time from the Billing page — your agent stops when the
                subscription ends.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={checkout} disabled={busy}>
              {busy ? "Redirecting…" : `Subscribe — $${monthly.toFixed(2)}/mo`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
