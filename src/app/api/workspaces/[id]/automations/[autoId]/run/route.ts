import { requireMember, requireUser } from "@/lib/auth";
import { runAutomation } from "@/lib/automations";
import { ApiError, handleError, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; autoId: string }> };

// Test or run a workflow on demand. mode 'test' runs freely and, on success,
// unlocks running; mode 'run' requires a passing test and uses a daily run.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId, autoId } = await params;
    const { supabase, user } = await requireUser();
    await requireMember(supabase, workspaceId, user.id);

    const { mode } = await readJson<{ mode?: "test" | "run" }>(request).catch(() => ({ mode: "test" }));
    const runMode = mode === "run" ? "run" : "test";

    // Confirm the workflow is in this workspace (RLS scopes the read).
    const { data: auto } = await supabase
      .from("automations")
      .select("id")
      .eq("id", autoId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!auto) throw new ApiError(404, "not_found", "Automation not found");

    const result = await runAutomation(autoId, {
      mode: runMode,
      contextText: runMode === "test" ? "This is a manual test run." : undefined,
    });
    return json(result);
  } catch (e) {
    return handleError(e);
  }
}
