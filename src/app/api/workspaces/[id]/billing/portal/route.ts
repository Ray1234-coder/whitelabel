import { requireMember, requireUser } from "@/lib/auth";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { ApiError, handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// Opens the Stripe billing portal so a member can update their card, see
// invoices, and cancel agent subscriptions themselves.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId } = await params;
    const { supabase, user } = await requireUser();
    await requireMember(supabase, workspaceId, user.id);

    if (!stripeConfigured()) {
      throw new ApiError(503, "billing_unavailable", "Billing isn't set up yet.");
    }

    const { data: row } = await supabase
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!row?.stripe_customer_id) {
      throw new ApiError(400, "no_billing_account", "You don't have any billing set up yet — add an agent first.");
    }

    const origin =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;

    const session = await getStripe().billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${origin}/dashboard/billing`,
    });

    return json({ url: session.url });
  } catch (e) {
    return handleError(e);
  }
}
