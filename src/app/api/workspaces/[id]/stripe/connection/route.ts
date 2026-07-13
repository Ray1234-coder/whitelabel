import { requireMember, requireUser } from "@/lib/auth";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { ApiError, handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// Whether this workspace has its own Stripe account linked (for the builder UI).
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId } = await params;
    const { supabase, user } = await requireUser();
    await requireMember(supabase, workspaceId, user.id);

    const { data } = await supabase
      .from("stripe_connections")
      .select("stripe_account_id, created_at")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    return json({
      available: !!process.env.STRIPE_CONNECT_CLIENT_ID,
      connected: !!data,
      account: data?.stripe_account_id ?? null,
    });
  } catch (e) {
    return handleError(e);
  }
}

// Disconnect: revoke platform access on Stripe's side, then drop the mapping.
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId } = await params;
    const { supabase, user } = await requireUser();
    await requireMember(supabase, workspaceId, user.id);

    const { data } = await supabase
      .from("stripe_connections")
      .select("stripe_account_id")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!data) throw new ApiError(404, "not_found", "No Stripe connection");

    if (stripeConfigured() && process.env.STRIPE_CONNECT_CLIENT_ID) {
      try {
        await getStripe().oauth.deauthorize({
          client_id: process.env.STRIPE_CONNECT_CLIENT_ID,
          stripe_user_id: data.stripe_account_id,
        });
      } catch {
        /* already revoked on Stripe's side is fine */
      }
    }

    const { error } = await supabase
      .from("stripe_connections")
      .delete()
      .eq("workspace_id", workspaceId);
    if (error) throw new ApiError(500, "db_error", error.message);

    return json({ disconnected: true });
  } catch (e) {
    return handleError(e);
  }
}
