import { requireMember, requireUser } from "@/lib/auth";
import { signState } from "@/lib/stripeConnect";
import { handleError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// Kicks off Stripe Connect OAuth: redirects the member to Stripe, where they
// sign in and click Approve — that's the whole customer experience.
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId } = await params;
    const { supabase, user } = await requireUser();
    await requireMember(supabase, workspaceId, user.id);

    const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
    const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
    if (!clientId) {
      return Response.redirect(`${origin}/dashboard/automations?stripe=unavailable`, 302);
    }

    const state = signState(workspaceId, Date.now() + 15 * 60 * 1000);
    const url = new URL("https://connect.stripe.com/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("scope", "read_write");
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", `${origin}/api/stripe/connect/callback`);
    return Response.redirect(url.toString(), 302);
  } catch (e) {
    return handleError(e);
  }
}
