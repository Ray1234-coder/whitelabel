import { requireMember, requireUser } from "@/lib/auth";
import { runAutomation, type AutomationRow } from "@/lib/automations";
import { ApiError, handleError, json } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; autoId: string }> };

// Run an automation on demand — the "test it out" button. Runs synchronously and
// returns the outcome so the user sees it worked.
export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId, autoId } = await params;
    const { supabase, user } = await requireUser();
    await requireMember(supabase, workspaceId, user.id);

    const { data: auto } = await supabase
      .from("automations")
      .select("id, workspace_id, agent37_id, instructions, cadence")
      .eq("id", autoId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!auto) throw new ApiError(404, "not_found", "Automation not found");

    const result = await runAutomation(auto as AutomationRow, "Manual test run.");
    return json(result);
  } catch (e) {
    return handleError(e);
  }
}
