import { randomUUID } from "crypto";
import { requireMember, requireUser } from "@/lib/auth";
import { CADENCE_MS, nextRunFromNow, type Cadence } from "@/lib/automations";
import { ApiError, handleError, json, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId } = await params;
    const { supabase, user } = await requireUser();
    await requireMember(supabase, workspaceId, user.id);

    const { data, error } = await supabase
      .from("automations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new ApiError(500, "db_error", error.message);

    return json({ automations: data ?? [] });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId } = await params;
    const { supabase, user } = await requireUser();
    await requireMember(supabase, workspaceId, user.id);

    const body = await readJson<{
      agent37_id?: string;
      name?: string;
      instructions?: string;
      trigger_type?: "schedule" | "webhook";
      cadence?: Cadence;
    }>(request);

    const name = (body.name || "").trim();
    const instructions = (body.instructions || "").trim();
    const agentId = body.agent37_id;
    if (!name || !instructions || !agentId) {
      throw new ApiError(400, "invalid_request", "name, instructions and agent are required");
    }
    if (body.trigger_type !== "schedule" && body.trigger_type !== "webhook") {
      throw new ApiError(400, "invalid_request", "trigger_type must be 'schedule' or 'webhook'");
    }

    // The agent must belong to this workspace (RLS scopes the read to members).
    const { data: agent } = await supabase
      .from("agents")
      .select("agent37_id")
      .eq("agent37_id", agentId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!agent) throw new ApiError(404, "not_found", "Agent not found in this workspace");

    const row: Record<string, unknown> = {
      workspace_id: workspaceId,
      agent37_id: agentId,
      name,
      instructions,
      trigger_type: body.trigger_type,
      created_by: user.id,
      enabled: true,
    };

    if (body.trigger_type === "schedule") {
      const cadence = body.cadence;
      if (!cadence || !(cadence in CADENCE_MS)) {
        throw new ApiError(400, "invalid_request", "cadence must be hourly, daily or weekly");
      }
      row.cadence = cadence;
      row.next_run_at = nextRunFromNow(cadence, Date.now());
    } else {
      row.webhook_token = randomUUID().replace(/-/g, "");
    }

    const { data, error } = await supabase.from("automations").insert(row).select("*").single();
    if (error) throw new ApiError(500, "db_error", error.message);

    return json({ automation: data }, 201);
  } catch (e) {
    return handleError(e);
  }
}
