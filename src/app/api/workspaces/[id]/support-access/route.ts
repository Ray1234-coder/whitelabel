import { requireAdmin, requireUser } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// The business controls whether Workify support can enter their workspace. When
// enabled, the support account is added as a member (so it can actually help);
// when disabled, it's removed and can no longer see anything. Admin-only.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId } = await params;
    const { supabase, user } = await requireUser();
    await requireAdmin(supabase, workspaceId, user.id);

    const { enabled } = await readJson<{ enabled?: boolean }>(request);
    const supportEmail = process.env.SUPPORT_EMAIL || "michael@home-energysolutions.com";

    const { error } = await supabase.rpc("set_support_access", {
      p_workspace: workspaceId,
      p_enabled: !!enabled,
      p_support_email: supportEmail,
    });
    if (error) throw new ApiError(500, "db_error", error.message);

    return json({ support_access: !!enabled });
  } catch (e) {
    return handleError(e);
  }
}
