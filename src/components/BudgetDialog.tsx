"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Cpu, Search, Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { usd } from "@/lib/format";
import { monthlyComputeUsd } from "@/config/agents";
import type { Budget, MergedAgent, ModelsResponse, Usage } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function BudgetDialog({
  open,
  onOpenChange,
  agent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: MergedAgent;
}) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const cpu = agent.cpu ?? 0;
  const memory = agent.memory ?? 0;
  const disk = agent.disk ?? 0;
  const computeCost = monthlyComputeUsd(cpu, memory, disk);
  const running = agent.live_status === "running";

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setModels(null);
    Promise.all([
      apiFetch<Budget>(`/api/agents/${agent.agent37_id}/budget`),
      apiFetch<Usage>(`/api/agents/${agent.agent37_id}/usage`),
    ])
      .then(([b, u]) => {
        setBudget(b);
        setUsage(u);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
    // Models only resolve while the agent is awake — best-effort, no error toast.
    apiFetch<ModelsResponse>(`/api/agents/${agent.agent37_id}/models`)
      .then(setModels)
      .catch(() => setModels(null));
  }, [open, agent.agent37_id]);

  const modelLabel =
    models?.data?.find((m) => m.is_default)?.label ||
    models?.default_model ||
    (running ? "Loading…" : "Available when the agent is running");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Usage &amp; billing</DialogTitle>
          <DialogDescription>
            What this agent runs on, and what it&apos;s costing you.
          </DialogDescription>
        </DialogHeader>

        {loading || !budget || !usage ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-4">
            {/* Model + size */}
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <Line label="Model">
                <span className="font-medium">{modelLabel}</span>
              </Line>
              <Line label="Type">
                <span className="capitalize">{(agent.template ?? "").replace("agent37-", "") || "—"}</span>
              </Line>
              <Line label="Size">
                <span className="flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  {cpu} vCPU · {memory} GB · {disk} GB
                </span>
              </Line>
              <Line label="Compute cost">
                <span className="tabular-nums">
                  ${computeCost.toFixed(2)}/mo{" "}
                  <span className="text-xs text-muted-foreground">
                    ({running ? "running now" : "when running"})
                  </span>
                </span>
              </Line>
            </div>

            {/* AI budget */}
            <div className="grid grid-cols-3 gap-3">
              <Stat label="AI budget" value={usd(budget.monthly_cap_micros)} />
              <Stat label="Spent" value={usd(budget.monthly_consumed_micros)} />
              <Stat label="Remaining" value={usd(budget.monthly_remaining_micros)} />
            </div>

            <div className="overflow-hidden rounded-md border">
              <UsageRow
                icon={<Sparkles />}
                label="LLM (the model)"
                cost={usage.by_integration.llm.cost_micros}
                calls={usage.by_integration.llm.calls}
              />
              <UsageRow
                icon={<Search />}
                label="Web search"
                cost={usage.by_integration.brave.cost_micros}
                calls={usage.by_integration.brave.calls}
              />
              <UsageRow
                icon={<Wrench />}
                label="App tools"
                cost={usage.by_integration.composio.cost_micros}
                calls={usage.by_integration.composio.calls}
                last
              />
            </div>
            <p className="text-xs text-muted-foreground">
              AI usage is billed at provider cost with no markup, capped by the AI budget above.
              Compute is separate and metered per minute from your workspace wallet.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function UsageRow({
  icon,
  label,
  cost,
  calls,
  last,
}: {
  icon: ReactNode;
  label: string;
  cost: number;
  calls: number;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between px-3 py-2.5 text-sm ${last ? "" : "border-b"}`}>
      <span className="flex items-center gap-2 font-medium [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="tabular-nums text-muted-foreground">
        {calls} calls · {usd(cost)}
      </span>
    </div>
  );
}
