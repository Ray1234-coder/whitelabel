import { agent37 } from "@/lib/agent37";
import { requireAdmin, requireUser } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";

function parseAgentId(value: string): string | null {
  const input = value.trim().toLowerCase();
  const urlMatch = input.match(/^https:\/\/([a-z0-9]{10})\.agent37\.app(?:\/|$)/);
  const id = urlMatch?.[1] ?? input;
  return /^[a-z0-9]{10}$/.test(id) ? id : null;
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await readJson<{ workspace_id?: string; agent?: string }>(request);

    const workspaceId = body.workspace_id;
    if (!workspaceId) throw new ApiError(400, "invalid_request", "workspace_id is required");
    await requireAdmin(supabase, workspaceId, user.id);

    const agentId = parseAgentId(body.agent ?? "");
    if (!agentId) {
      throw new ApiError(
        400,
        "invalid_request",
        "Enter a 10-character Agent37 instance ID or its agent37.app URL"
      );
    }

    const { data: existing } = await supabase
      .from("agents")
      .select("agent37_id")
      .eq("agent37_id", agentId)
      .maybeSingle();
    if (existing) {
      throw new ApiError(409, "already_attached", "This agent is already attached to Workify");
    }

    // This also proves the instance belongs to the Agent37 workspace behind
    // Workify's server-side API key. Other-workspace IDs return a uniform 404.
    const agent = await agent37.getAgent(agentId);
    const { error } = await supabase.from("agents").insert({
      agent37_id: agent.id,
      workspace_id: workspaceId,
      name: agent.name || null,
      status: agent.status,
      template: agent.template,
      cpu: agent.resources.cpu,
      memory: agent.resources.memory,
      disk: agent.resources.disk,
      created_by: user.id,
      // External agents are detached from Workify instead of destroyed.
      plan: "external",
    });

    if (error?.code === "23505") {
      throw new ApiError(409, "already_attached", "This agent is already attached to Workify");
    }
    if (error) throw new ApiError(500, "db_error", error.message);

    return json(agent, 201);
  } catch (e) {
    return handleError(e);
  }
}
