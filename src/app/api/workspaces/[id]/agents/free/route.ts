import { agent37 } from "@/lib/agent37";
import { requireMember, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { FREE_AGENT } from "@/config/agents";
import { usdToMicros } from "@/lib/format";
import { ApiError, handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// Creates the workspace's one free-trial agent — no payment. Any member can do
// this; the agent is limited (small box, small AI budget) and rate-limited to a
// couple of runs/day (enforced in the chat route via consume_free_run).
// Uses the service-role client so a customer can get a free agent even though
// direct agent inserts are otherwise admin-only under RLS.
export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId } = await params;
    const { supabase, user } = await requireUser();
    await requireMember(supabase, workspaceId, user.id);

    const db = createAdminClient();

    // One free agent per workspace.
    const { data: existing } = await db
      .from("agents")
      .select("agent37_id")
      .eq("workspace_id", workspaceId)
      .eq("plan", "free")
      .maybeSingle();
    if (existing) {
      throw new ApiError(409, "free_limit", "This workspace already has a free trial agent.");
    }

    let agentId: string | null = null;
    try {
      const agent = await agent37.createAgent({
        template: FREE_AGENT.template,
        resources: { cpu: FREE_AGENT.cpu, memory: FREE_AGENT.memory, disk: FREE_AGENT.disk },
        user: user.id,
        metadata: { app_workspace: workspaceId, plan: "free" },
        budget: { monthly_cap_micros: usdToMicros(FREE_AGENT.monthlyCapUsd) },
      });
      agentId = agent.id;

      const { error } = await db.from("agents").insert({
        agent37_id: agent.id,
        workspace_id: workspaceId,
        name: agent.name || "Free trial agent",
        status: agent.status,
        template: agent.template,
        cpu: agent.resources.cpu,
        memory: agent.resources.memory,
        disk: agent.resources.disk,
        created_by: user.id,
        plan: "free",
      });
      if (error) throw new Error(error.message);

      return json({ id: agent.id, plan: "free" }, 201);
    } catch (e) {
      if (agentId) {
        try {
          await agent37.deleteAgent(agentId);
        } catch {
          /* best-effort rollback */
        }
      }
      throw e instanceof ApiError ? e : new ApiError(502, "provision_failed", (e as Error).message);
    }
  } catch (e) {
    return handleError(e);
  }
}
