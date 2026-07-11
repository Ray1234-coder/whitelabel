import "server-only";
import { agent37, dataPlaneFetch } from "@/lib/agent37";
import { createAdminClient } from "@/lib/supabase/admin";
import { WORKFLOW_RUNS_PER_DAY } from "@/config/agents";

export const CADENCE_MS = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
} as const;
export type Cadence = keyof typeof CADENCE_MS;

export function nextRunFromNow(cadence: Cadence, fromMs: number): string {
  return new Date(fromMs + CADENCE_MS[cadence]).toISOString();
}

export interface WorkflowStep {
  id?: string;
  title: string;
  instructions: string;
}

export interface StepResult {
  title: string;
  status: "ok" | "error" | "skipped";
  output: string;
}

export interface RunResult {
  status: "ok" | "error" | "skipped" | "limit";
  detail: string;
  steps: StepResult[];
}

type AdminDb = ReturnType<typeof createAdminClient>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

export async function getKnowledge(db: AdminDb, workspaceId: string): Promise<string> {
  const { data } = await db
    .from("knowledge_base")
    .select("content")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return (data?.content || "").slice(0, 6000);
}

async function logRun(
  db: AdminDb,
  automationId: string,
  workspaceId: string,
  status: string,
  detail: string
): Promise<void> {
  await db
    .from("automation_runs")
    .insert({ automation_id: automationId, workspace_id: workspaceId, status, detail: detail.slice(0, 2000) });
  await db
    .from("automations")
    .update({ last_run_at: new Date().toISOString(), last_status: status })
    .eq("id", automationId);
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
      (typeof body.error === "string" && /unreachable|not ready|waking|starting/i.test(body.error));
    if (!unreachable) {
      return (body.output_text as string) ?? (body.output as string) ?? "";
    }
    try {
      await agent37.start(id);
    } catch {
      /* may already be starting */
    }
    await sleep(8000);
  }
  throw new Error("Agent didn't become ready in time");
}

// Run a workflow. mode 'test' runs freely and, on success, marks it tested.
// mode 'run' requires a prior passing test and consumes a daily run.
export async function runAutomation(
  automationId: string,
  opts: { contextText?: string; mode: "test" | "run" }
): Promise<RunResult> {
  const db = createAdminClient();

  const { data: auto } = await db.from("automations").select("*").eq("id", automationId).maybeSingle();
  if (!auto) return { status: "error", detail: "Automation not found", steps: [] };

  const { data: agent } = await db
    .from("agents")
    .select("plan, model, provider, free_runs_date, free_runs_used")
    .eq("agent37_id", auto.agent37_id)
    .maybeSingle();
  if (!agent) {
    await logRun(db, auto.id, auto.workspace_id, "error", "The agent no longer exists.");
    return { status: "error", detail: "agent missing", steps: [] };
  }

  // Real runs: must be tested, and within the daily cap.
  if (opts.mode === "run") {
    if (!auto.tested_at) {
      await logRun(db, auto.id, auto.workspace_id, "skipped", "Not tested yet.");
      return { status: "skipped", detail: "Test this workflow before running it.", steps: [] };
    }
    let used = auto.runs_used ?? 0;
    if (auto.runs_date !== today()) used = 0;
    if (used >= WORKFLOW_RUNS_PER_DAY) {
      await logRun(db, auto.id, auto.workspace_id, "limit", "Daily run limit reached.");
      return {
        status: "limit",
        detail: `Daily run limit reached (${WORKFLOW_RUNS_PER_DAY}/day). Resets tomorrow.`,
        steps: [],
      };
    }
    await db.from("automations").update({ runs_date: today(), runs_used: used + 1 }).eq("id", auto.id);
  }

  // Free-tier agent cap (per agent), counted once per whole workflow run.
  if (agent.plan === "free") {
    let used = agent.free_runs_used ?? 0;
    if (agent.free_runs_date !== today()) used = 0;
    if (used >= 2) {
      await logRun(db, auto.id, auto.workspace_id, "limit", "Free trial daily limit reached.");
      return { status: "limit", detail: "Free trial daily run limit reached.", steps: [] };
    }
    await db
      .from("agents")
      .update({ free_runs_date: today(), free_runs_used: used + 1 })
      .eq("agent37_id", auto.agent37_id);
  }

  const kb = await getKnowledge(db, auto.workspace_id);
  const steps: WorkflowStep[] =
    Array.isArray(auto.steps) && auto.steps.length
      ? (auto.steps as WorkflowStep[])
      : [{ title: auto.name, instructions: auto.instructions }];

  const results: StepResult[] = [];
  let prevOutput = "";
  let overall: RunResult["status"] = "ok";

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (overall === "error") {
      results.push({ title: s.title, status: "skipped", output: "" });
      continue;
    }
    const parts: string[] = [];
    if (kb) parts.push(`What you know about this company:\n${kb}`);
    if (i === 0 && opts.contextText) parts.push(`Incoming event:\n${opts.contextText}`);
    if (prevOutput) parts.push(`Result of the previous step:\n${prevOutput}`);
    parts.push(`Your task for this step:\n${s.instructions}`);
    const input = parts.join("\n\n---\n\n");
    try {
      const out = await callAgent(auto.agent37_id, input, agent.model ?? null, agent.provider ?? null);
      results.push({ title: s.title, status: "ok", output: out });
      prevOutput = out;
    } catch (e) {
      results.push({ title: s.title, status: "error", output: (e as Error).message });
      overall = "error";
    }
  }

  // A clean test unlocks running.
  if (opts.mode === "test" && overall === "ok") {
    await db.from("automations").update({ tested_at: new Date().toISOString() }).eq("id", auto.id);
  }

  const detail = results.map((r) => `${r.title}: ${r.status}`).join(" | ");
  await logRun(db, auto.id, auto.workspace_id, overall, detail);
  return { status: overall, detail, steps: results };
}

// Fire every enabled, tested workflow subscribed to a provider event (Stripe,
// Slack, …). Called from the event-receiver routes. Matches by source and, if
// the workflow set a filter (e.g. a Stripe event type), by that too.
export async function runEventTriggers(
  source: string,
  eventType: string,
  contextText: string
): Promise<number> {
  const db = createAdminClient();
  const { data } = await db
    .from("automations")
    .select("id, event_filter")
    .eq("trigger_type", "event")
    .eq("event_source", source)
    .eq("enabled", true)
    .not("tested_at", "is", null);
  const matches = (data ?? []).filter(
    (a) => !a.event_filter || a.event_filter === eventType
  );
  for (const a of matches) {
    try {
      await runAutomation(a.id, { mode: "run", contextText });
    } catch {
      /* runAutomation logs its own failures */
    }
  }
  return matches.length;
}
