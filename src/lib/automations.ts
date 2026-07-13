import "server-only";
import { agent37, dataPlaneFetch } from "@/lib/agent37";
import { createAdminClient } from "@/lib/supabase/admin";
import { WORKFLOW_RUNS_PER_DAY } from "@/config/agents";
import { isSplitNode, type WorkflowNode, type WorkflowStep as WfStep } from "@/lib/types";

export const CADENCE_MS = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
} as const;
export type Cadence = keyof typeof CADENCE_MS;

export function nextRunFromNow(cadence: Cadence, fromMs: number): string {
  return new Date(fromMs + CADENCE_MS[cadence]).toISOString();
}

export type { WorkflowStep } from "@/lib/types";

export interface StepResult {
  // Position key matching the builder's layout: "2" for a plain node,
  // "2.b0.s1" for split node 2, branch 0, step 1.
  key: string;
  title: string;
  branch?: string;
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
  const nodes: WorkflowNode[] =
    Array.isArray(auto.steps) && auto.steps.length
      ? (auto.steps as WorkflowNode[])
      : [{ title: auto.name, instructions: auto.instructions }];

  const results: StepResult[] = [];
  let stageInput = ""; // output of the previous node, fed into the next
  let overall: RunResult["status"] = "ok";

  const buildInput = (task: string, prev: string, isFirstStage: boolean) => {
    const parts: string[] = [];
    if (kb) parts.push(`What you know about this company:\n${kb}`);
    if (isFirstStage && opts.contextText) parts.push(`Incoming event:\n${opts.contextText}`);
    if (prev) parts.push(`Result of the previous step:\n${prev}`);
    parts.push(`Your task for this step:\n${task}`);
    return parts.join("\n\n---\n\n");
  };

  // Run one branch's steps in sequence; returns the branch's final output.
  const runBranch = async (
    nodeIdx: number,
    branchIdx: number,
    branchTitle: string,
    steps: WfStep[],
    seed: string
  ): Promise<{ ok: boolean; output: string; results: StepResult[] }> => {
    const branchResults: StepResult[] = [];
    let prev = seed;
    for (let si = 0; si < steps.length; si++) {
      const s = steps[si];
      const key = `${nodeIdx}.b${branchIdx}.s${si}`;
      try {
        const out = await callAgent(
          auto.agent37_id,
          buildInput(s.instructions, prev, nodeIdx === 0),
          agent.model ?? null,
          agent.provider ?? null
        );
        branchResults.push({ key, title: s.title, branch: branchTitle, status: "ok", output: out });
        prev = out;
      } catch (e) {
        branchResults.push({ key, title: s.title, branch: branchTitle, status: "error", output: (e as Error).message });
        // Remaining steps in this branch are skipped.
        for (let sj = si + 1; sj < steps.length; sj++) {
          branchResults.push({ key: `${nodeIdx}.b${branchIdx}.s${sj}`, title: steps[sj].title, branch: branchTitle, status: "skipped", output: "" });
        }
        return { ok: false, output: "", results: branchResults };
      }
    }
    return { ok: true, output: prev, results: branchResults };
  };

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (overall === "error") {
      // A failed earlier node skips the rest (branches included, flattened).
      if (isSplitNode(node)) {
        node.branches.forEach((b, bi) =>
          b.steps.forEach((s, si) =>
            results.push({ key: `${i}.b${bi}.s${si}`, title: s.title, branch: b.title, status: "skipped", output: "" })
          )
        );
      } else {
        results.push({ key: `${i}`, title: node.title, status: "skipped", output: "" });
      }
      continue;
    }

    if (isSplitNode(node)) {
      // Fan out: every branch starts from the same input and runs concurrently;
      // outputs merge (labeled by branch) into the next node's input.
      const settled = await Promise.all(
        node.branches.map((b, bi) => runBranch(i, bi, b.title || `Branch ${bi + 1}`, b.steps, stageInput))
      );
      settled.forEach((r) => results.push(...r.results));
      if (settled.some((r) => !r.ok)) {
        overall = "error";
      } else {
        stageInput = settled
          .map((r, bi) => `[${node.branches[bi].title || `Branch ${bi + 1}`}]\n${r.output}`)
          .join("\n\n");
      }
    } else {
      try {
        const out = await callAgent(
          auto.agent37_id,
          buildInput(node.instructions, stageInput, i === 0),
          agent.model ?? null,
          agent.provider ?? null
        );
        results.push({ key: `${i}`, title: node.title, status: "ok", output: out });
        stageInput = out;
      } catch (e) {
        results.push({ key: `${i}`, title: node.title, status: "error", output: (e as Error).message });
        overall = "error";
      }
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
// the workflow set a filter (e.g. a Stripe event type), by that too. Pass
// workspaceId to scope delivery to one tenant (Stripe Connect events); omitting
// it broadcasts — only appropriate for single-tenant sources like the one
// admin-owned Slack app.
export async function runEventTriggers(
  source: string,
  eventType: string,
  contextText: string,
  workspaceId?: string
): Promise<number> {
  const db = createAdminClient();
  let query = db
    .from("automations")
    .select("id, event_filter")
    .eq("trigger_type", "event")
    .eq("event_source", source)
    .eq("enabled", true)
    .not("tested_at", "is", null);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data } = await query;
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
