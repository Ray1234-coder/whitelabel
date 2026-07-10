import { requireMember, requireUser } from "@/lib/auth";
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

    // RLS scopes this: admins see every invite; a customer sees only the ones
    // they created (so they can copy or revoke their own links).
    const { data: inv } = await supabase
      .from("invitations")
      .select("*")
      .eq("workspace_id", id)
      .order("created_at", { ascending: false });
    const invitations = (inv as Invitation[]) ?? [];

    const { data: ws } = await supabase
      .from("workspaces")
      .select("support_access")
      .eq("id", id)
      .maybeSingle();

    return json({
      members: (members as WorkspaceMember[]) ?? [],
      invitations,
      role,
      support_access: ws?.support_access ?? false,
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { supabase, user } = await requireUser();
    // Any member may invite coworkers; admin-only powers are gated below.
    const callerRole = await requireMember(supabase, id, user.id);
    const callerIsAdmin = callerRole === "admin";
    const { role = "customer", user_id } = await readJson<{ role?: Role; user_id?: string }>(
      request
    );
    if (!["admin", "customer"].includes(role)) {
      throw new ApiError(400, "invalid_request", "Invalid role");
    }
    // Only an admin can grant admin. RLS enforces this too — defense in depth.
    if (role === "admin" && !callerIsAdmin) {
      throw new ApiError(403, "forbidden", "Only an admin can add another admin");
    }

    // With a user_id, add that signed-up account to the workspace directly (no
    // invite link). Admin-only: it needs the user directory. Customers add
    // people by sharing an invite link instead.
    if (user_id) {
      if (!callerIsAdmin) {
        throw new ApiError(
          403,
          "forbidden",
          "Only an admin can add an existing account directly — share an invite link instead."
        );
      }
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
