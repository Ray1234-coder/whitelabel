export interface Shape {
  id: string;
  label: string;
  cpu: number;
  memory: number;
  disk: number;
  blurb: string;
}

// Per-month compute rates (Agent37 billing). Metered per minute against the wallet.
export const COMPUTE_RATES = { cpu: 0.8, memory: 0.7, disk: 0.09 } as const;

export function monthlyComputeUsd(cpu: number, memory: number, disk: number): number {
  return cpu * COMPUTE_RATES.cpu + memory * COMPUTE_RATES.memory + disk * COMPUTE_RATES.disk;
}

// Customer-facing markup. Customers who add their own agents (and pay via Stripe)
// are billed this multiple of the underlying Agent37 cost. One knob — change here.
export const PRICE_MULTIPLIER = 3;

// The monthly price a customer pays for an agent: PRICE_MULTIPLIER × the worst-case
// Agent37 cost (compute while running + the monthly AI budget cap).
export function customerMonthlyUsd(
  cpu: number,
  memory: number,
  disk: number,
  aiCapUsd = 0
): number {
  return (monthlyComputeUsd(cpu, memory, disk) + Math.max(0, aiCapUsd)) * PRICE_MULTIPLIER;
}

// Selectable sizes at create time. Disk is the shape's default (range minimum).
// The 1 vCPU size needs a dedicated template, so it is not offered here.
export const SHAPE_PRESETS: Shape[] = [
  { id: "standard", label: "Standard", cpu: 2, memory: 4, disk: 6, blurb: "Everyday chat, email, docs" },
  { id: "pro", label: "Pro", cpu: 4, memory: 8, disk: 20, blurb: "Heavier browsing, code, data" },
  { id: "max", label: "Max", cpu: 8, memory: 16, disk: 40, blurb: "Large jobs, many tools at once" },
];

export const DEFAULT_AGENT = {
  template: "agent37-hermes",
  cpu: 2,
  memory: 4,
  disk: 6,
  monthlyCapUsd: 5,
} as const;

export interface AgentTypeOption {
  id: string;
  template: string;
  label: string;
  description: string;
  recommended?: boolean;
}

export const AGENT_TYPES: AgentTypeOption[] = [
  {
    id: "hermes",
    template: "agent37-hermes",
    label: "Hermes",
    description: "General agent: chat, browsing, code, files.",
    recommended: true,
  },
  {
    id: "openclaw",
    template: "agent37-openclaw",
    label: "OpenClaw",
    description: "General agent: headless browser, code, files.",
  },
];

export const AGENT_TEMPLATES = AGENT_TYPES.map((a) => a.template);

export const PORTS = {
  dashboard: 9119,
  terminal: 7681,
  files: 8080,
} as const;
