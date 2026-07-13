import { requireMember, requireUser } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import { normalizeNodes, summarizeNodes } from "@/lib/workflowNodes";

type Ctx = { params: Promise<{ id: string; autoId: string }> };

// Toggle enabled (or rename). RLS restricts the row to the caller's workspace.
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId, autoId } = await params;
    const { supabase, user } = await requireUser();
    await requireMember(supabase, workspaceId, user.id);

    const body = await readJson<{
      enabled?: boolean;
      name?: string;
      steps?: unknown;
    }>(request);
    const patch: Record<string, unknown> = {};
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();

    // Editing the steps invalidates the previous test — must re-test before running.
    if (Array.isArray(body.steps)) {
      const cleanSteps = normalizeNodes(body.steps);
      if (cleanSteps.length === 0) {
        throw new ApiError(400, "invalid_request", "a workflow needs at least one step");
      }
      patch.steps = cleanSteps;
      patch.instructions = summarizeNodes(cleanSteps);
      patch.tested_at = null;
    }

    if (Object.keys(patch).length === 0) {
      throw new ApiError(400, "invalid_request", "nothing to update");
    }

    const { data, error } = await supabase
      .from("automations")
      .update(patch)
      .eq("id", autoId)
      .eq("workspace_id", workspaceId)
      .select("*")
      .maybeSingle();
    if (error) throw new ApiError(500, "db_error", error.message);
    if (!data) throw new ApiError(404, "not_found", "Automation not found");

    return json({ automation: data });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId, autoId } = await params;
    const { supabase, user } = await requireUser();
    await requireMember(supabase, workspaceId, user.id);

    const { error } = await supabase
      .from("automations")
      .delete()
      .eq("id", autoId)
      .eq("workspace_id", workspaceId);
    if (error) throw new ApiError(500, "db_error", error.message);

    return json({ id: autoId, deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
