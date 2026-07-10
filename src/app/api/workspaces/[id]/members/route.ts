import { requireAdmin, requireMember, requireUser } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import type { Invitation, Role, WorkspaceMember } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { supabase, user } = await requireUser();
    const role = await requireMember(supabase, id, user.id);

    const { data: members, error } = await supabase.rpc("get_workspace_members", { p_workspace: id });
    if (error) throw new ApiError(500, "db_error", error.message);

    let invitations: Invitation[] = [];
    if (role === "admin") {
      const { data: inv } = await supabase
        .from("invitations")
        .select("*")
        .eq("workspace_id", id)
        .order("created_at", { ascending: false });
      invitations = (inv as Invitation[]) ?? [];
    }

    return json({ members: (members as WorkspaceMember[]) ?? [], invitations, role });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { supabase, user } = await requireUser();
    await requireAdmin(supabase, id, user.id);
    const { role = "customer", user_id } = await readJson<{ role?: Role; user_id?: string }>(
      request
    );
    if (!["admin", "customer"].includes(role)) {
      throw new ApiError(400, "invalid_request", "Invalid role");
    }

    // With a user_id, add that signed-up account to the workspace directly
    // (no invite link) — RLS allows the insert because the caller is an admin.
    if (user_id) {
      const { error } = await supabase
        .from("memberships")
        .insert({ workspace_id: id, user_id, role });
      if (error) {
        if (error.code === "23505") {
          throw new ApiError(409, "already_member", "That user is already in this workspace");
        }
        throw new ApiError(500, "db_error", error.message);
      }
      return json({ workspace_id: id, user_id, role }, 201);
    }

    const { data, error } = await supabase
      .from("invitations")
      .insert({ workspace_id: id, role, created_by: user.id })
      .select("token")
      .single();
    if (error) throw new ApiError(500, "db_error", error.message);

    const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
    const url = `${origin}/invite/${data.token}`;

    return json({ token: data.token, url }, 201);
  } catch (e) {
    return handleError(e);
  }
}
