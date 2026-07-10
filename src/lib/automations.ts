import "server-only";
import { agent37, dataPlaneFetch } from "@/lib/agent37";
import { createAdminClient } from "@/lib/supabase/admin";

export const CADENCE_MS = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
} as const;
export type Cadence = keyof typeof CADENCE_MS;

export function nextRunFromNow(cadence: Cadence, fromMs: number): string {
  return new Date(fromMs + CADENCE_MS[cadence]).toISOString();
}

export interface AutomationRow {
  id: string;
  workspace_id: string;
  agent37_id: string;
  instructions: string;
  cadence: Cadence | null;
}

type AdminDb = ReturnType<typeof createAdminClient>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function logRun(
  db: AdminDb,
  auto: AutomationRow,
  status: string,
  detail: string
): Promise<void> {
  await db.from("automation_runs").insert({
    automation_id: auto.id,
    workspace_id: auto.workspace_id,
    status,
    detail: detail.slice(0, 1000),
  });
  await db
    .from("automations")
    .update({ last_run_at: new Date().toISOString(), last_status: status })
    .eq("id", auto.id);
}

// Post one turn to the agent, waking it if it's asleep. Returns the output text.
async function callAgent(
  id: string,
  input: string,
  model: string | null,
  provider: string | null
): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const upstream = await dataPlaneFetch(id, "/responses", {
      method: "POST",
      body: JSON.stringify({
        input,
        ...(model ? { model } : {}),
        ...(provider ? { provider } : {}),
        stream: false,
      }),
    });

    const raw = await upstream.text().catch(() => "");
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* non-JSON */
    }

    const unreachable =
      !upstream.ok ||
      typeof body.error === "string" && /unreachable|not ready|waking|starting/i.test(body.error as string);

    if (!unreachable) {
      return (body.output_text as string) ?? (body.output as string) ?? "";
    }

    // Asleep / booting — start it and wait, then retry.
    try {
      await agent37.start(id);
    } catch {
      /* may already be starting */
    }
    await sleep(8000);
  }
  throw new Error("Agent didn't become ready in time");
}

// Run one automation. contextText is the webhook payload (undefined for schedules).
export async function runAutomation(
  auto: AutomationRow,
  contextText?: string
): Promise<{ status: string; detail: string }> {
  const db = createAdminClient();

  const { data: agent } = await db
    .from("agents")
    .select("plan, model, provider, free_runs_date, free_runs_used")
    .eq("agent37_id", auto.agent37_id)
    .maybeSingle();

  if (!agent) {
    await logRun(db, auto, "error", "The agent for this automation no longer exists.");
    return { status: "error", detail: "agent missing" };
  }

  // Free-tier daily run cap (the runner has no user session, so enforce directly).
  if (agent.plan === "free") {
    const today = new Date().toISOString().slice(0, 10);
    let used = agent.free_runs_used ?? 0;
    if (agent.free_runs_date !== today) used = 0;
    if (used >= 2) {
      await logRun(db, auto, "limit", "Free trial daily run limit reached — resets tomorrow.");
      return { status: "limit", detail: "free limit reached" };
    }
    await db
      .from("agents")
      .update({ free_runs_date: today, free_runs_used: used + 1 })
      .eq("agent37_id", auto.agent37_id);
  }

  const input = contextText
    ? `${auto.instructions}\n\n--- Incoming event ---\n${contextText}`
    : auto.instructions;

  try {
    const out = await callAgent(auto.agent37_id, input, agent.model ?? null, agent.provider ?? null);
    await logRun(db, auto, "ok", out || "(no text output)");
    return { status: "ok", detail: out };
  } catch (e) {
    const detail = (e as Error).message;
    await logRun(db, auto, "error", detail);
    return { status: "error", detail };
  }
}
