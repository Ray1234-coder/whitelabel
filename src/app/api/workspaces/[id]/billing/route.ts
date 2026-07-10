import { requireMember, requireUser } from "@/lib/auth";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { ApiError, handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export interface BillingSubscription {
  id: string;
  status: string;
  amount: number; // dollars/month
  agentName: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

// Billing overview for the current member: whether billing is live, and this
// member's own agent subscriptions in this workspace.
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId } = await params;
    const { supabase, user } = await requireUser();
    await requireMember(supabase, workspaceId, user.id);

    if (!stripeConfigured()) {
      return json({ configured: false, subscriptions: [] as BillingSubscription[] });
    }

    const { data: row } = await supabase
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!row?.stripe_customer_id) {
      return json({ configured: true, hasAccount: false, subscriptions: [] as BillingSubscription[] });
    }

    const stripe = getStripe();
    const subs = await stripe.subscriptions.list({
      customer: row.stripe_customer_id,
      status: "all",
      limit: 100,
    });

    const subscriptions: BillingSubscription[] = subs.data
      .filter((s) => s.status !== "incomplete_expired" && s.status !== "canceled")
      .map((s) => {
        const item = s.items.data[0];
        const unit = item?.price?.unit_amount ?? 0;
        const product = item?.price?.product;
        const agentName =
          product && typeof product === "object" && "name" in product && typeof product.name === "string"
            ? product.name
            : "Agent subscription";
        // current_period_end lives on the subscription across the versions we use;
        // read defensively so a shape change can't break the page.
        const periodEnd = (s as unknown as { current_period_end?: number }).current_period_end ?? null;
        return {
          id: s.id,
          status: s.status,
          amount: unit / 100,
          agentName,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: s.cancel_at_period_end,
        };
      });

    return json({ configured: true, hasAccount: true, subscriptions });
  } catch (e) {
    return handleError(e);
  }
}
