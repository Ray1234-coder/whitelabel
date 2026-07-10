import { requireMember, requireUser } from "@/lib/auth";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import {
  AGENT_TEMPLATES,
  AGENT_TYPES,
  DEFAULT_AGENT,
  SHAPE_PRESETS,
  customerMonthlyUsd,
} from "@/config/agents";
import { ApiError, handleError, json, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// Starts a Stripe Checkout (subscription) for a new agent the member wants to add.
// The agent itself is NOT created here — it's created by the webhook once payment
// succeeds, so an unpaid session never spends the Agent37 wallet.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId } = await params;
    const { supabase, user } = await requireUser();
    await requireMember(supabase, workspaceId, user.id);

    if (!stripeConfigured()) {
      throw new ApiError(503, "billing_unavailable", "Billing isn't set up yet. Ask your workspace admin.");
    }

    const body = await readJson<{ template?: string; shape?: string; monthly_cap_usd?: number }>(
      request
    );

    const template =
      body.template && AGENT_TEMPLATES.includes(body.template) ? body.template : DEFAULT_AGENT.template;
    const shape = SHAPE_PRESETS.find((s) => s.id === body.shape) ?? SHAPE_PRESETS[0];
    const capUsd =
      typeof body.monthly_cap_usd === "number" && body.monthly_cap_usd >= 0
        ? Math.min(body.monthly_cap_usd, 1000)
        : DEFAULT_AGENT.monthlyCapUsd;

    const price = customerMonthlyUsd(shape.cpu, shape.memory, shape.disk, capUsd);
    const unitAmount = Math.round(price * 100); // cents

    const stripe = getStripe();

    // Find or create this member's Stripe customer for the workspace.
    const { data: existing } = await supabase
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { workspace_id: workspaceId, user_id: user.id },
      });
      customerId = customer.id;
      await supabase
        .from("billing_customers")
        .upsert({ workspace_id: workspaceId, user_id: user.id, stripe_customer_id: customerId });
    }

    const typeLabel = AGENT_TYPES.find((t) => t.template === template)?.label ?? "Agent";
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;

    // Config the webhook needs to actually build the agent after payment.
    const meta = {
      kind: "agent_subscription",
      workspace_id: workspaceId,
      user_id: user.id,
      template,
      shape: shape.id,
      monthly_cap_usd: String(capUsd),
    };

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: unitAmount,
            recurring: { interval: "month" },
            product_data: {
              name: `${typeLabel} agent — ${shape.label}`,
              description: `${shape.cpu} vCPU · ${shape.memory} GB RAM · ${shape.disk} GB · includes 24/7 customer support with setup help`,
            },
          },
        },
      ],
      metadata: meta,
      subscription_data: { metadata: meta },
      success_url: `${origin}/dashboard/billing?checkout=success`,
      cancel_url: `${origin}/dashboard/billing?checkout=cancel`,
    });

    if (!session.url) throw new ApiError(502, "billing_error", "Stripe did not return a checkout URL");
    return json({ url: session.url });
  } catch (e) {
    return handleError(e);
  }
}
