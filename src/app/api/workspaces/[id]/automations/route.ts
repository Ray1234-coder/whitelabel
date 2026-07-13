import { randomUUID } from "crypto";
import { requireMember, requireUser } from "@/lib/auth";
import { CADENCE_MS, nextRunFromNow, type Cadence } from "@/lib/automations";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import { normalizeNodes, summarizeNodes } from "@/lib/workflowNodes";

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
      steps?: unknown;
      trigger_type?: "schedule" | "webhook" | "event";
      cadence?: Cadence;
      event_source?: string;
      event_filter?: string;
    }>(request);

    const name = (body.name || "").trim();
    const agentId = body.agent37_id;

    // Normalize nodes (plain steps and parallel splits). Fall back to a single
    // instruction for agent-created flat workflows.
    const cleanSteps = normalizeNodes(body.steps);
    const instructions =
      cleanSteps.length > 0 ? summarizeNodes(cleanSteps) : (body.instructions || "").trim();

    if (!name || !instructions || !agentId) {
      throw new ApiError(400, "invalid_request", "name, at least one step, and an agent are required");
    }
    if (!["schedule", "webhook", "event"].includes(body.trigger_type ?? "")) {
      throw new ApiError(400, "invalid_request", "trigger_type must be 'schedule', 'webhook' or 'event'");
    }
    if (body.trigger_type === "event" && !["stripe", "slack"].includes(body.event_source ?? "")) {
      throw new ApiError(400, "invalid_request", "event_source must be 'stripe' or 'slack'");
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
      steps: cleanSteps.length > 0 ? cleanSteps : null,
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
    } else if (body.trigger_type === "event") {
      row.event_source = body.event_source;
      row.event_filter = (body.event_filter || "").trim() || null;
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
