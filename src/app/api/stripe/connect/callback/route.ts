import { requireMember, requireUser } from "@/lib/auth";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { verifyState } from "@/lib/stripeConnect";

export const runtime = "nodejs";

// Stripe Connect OAuth return leg. The member's browser lands here after they
// approve on Stripe; we verify the signed state, confirm membership, swap the
// code for their account id, and store the workspace ↔ account mapping.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || url.origin;
  const back = (q: string) => Response.redirect(`${origin}/dashboard/automations?stripe=${q}`, 302);

  try {
    if (!stripeConfigured()) return back("unavailable");
    if (url.searchParams.get("error")) return back("denied");

    const code = url.searchParams.get("code");
    const workspaceId = verifyState(url.searchParams.get("state") || "");
    if (!code || !workspaceId) return back("invalid");

    const { supabase, user } = await requireUser();
    await requireMember(supabase, workspaceId, user.id);

    const resp = await getStripe().oauth.token({ grant_type: "authorization_code", code });
    const account = resp.stripe_user_id;
    if (!account) return back("failed");

    const { error } = await supabase.from("stripe_connections").upsert({
      workspace_id: workspaceId,
      stripe_account_id: account,
      connected_by: user.id,
    });
    if (error) return back("failed");

    return back("connected");
  } catch (e) {
    console.error("[stripe connect callback]", e);
    return back("failed");
  }
}
