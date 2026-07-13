import type Stripe from "stripe";
import { agent37 } from "@/lib/agent37";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_AGENT, SHAPE_PRESETS } from "@/config/agents";
import { usdToMicros } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe → us. Verifies the signature, then:
//  - checkout.session.completed  → create the paid agent (the gate: no payment,
//    no agent, so an abandoned checkout never spends the Agent37 wallet).
//  - customer.subscription.deleted → tear the agent down.
// Uses the service-role client because Stripe calls have no user session.
export async function POST(request: Request) {
  if (!stripeConfigured()) return new Response("billing not configured", { status: 503 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("webhook secret not set", { status: 500 });

  const sig = request.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });

  const raw = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    return new Response(`signature verification failed: ${(e as Error).message}`, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, stripe);
    } else if (event.type === "customer.subscription.deleted") {
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
    }
    // NOTE: workflow event-triggers are NOT fired from here. This endpoint hears
    // the PLATFORM account (Workify's own billing); broadcasting those events to
    // customer workflows would leak billing data across tenants. Customer Stripe
    // triggers run via /api/stripe/connect-webhook, scoped per connected account.
  } catch (e) {
    // Log and 500 so Stripe retries transient failures.
    console.error(`[stripe webhook] ${event.type} failed:`, e);
    return new Response("handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, stripe: Stripe) {
  const meta = session.metadata ?? {};
  if (meta.kind !== "agent_subscription") return;

  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!subscriptionId) return;

  const workspaceId = meta.workspace_id;
  const userId = meta.user_id;
  if (!workspaceId || !userId) return;

  const db = createAdminClient();

  // Idempotency: Stripe may deliver an event more than once.
  const { data: existing } = await db
    .from("agents")
    .select("agent37_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (existing) return;

  const template = meta.template || DEFAULT_AGENT.template;
  const shape = SHAPE_PRESETS.find((s) => s.id === meta.shape) ?? SHAPE_PRESETS[0];
  const capUsd = Number(meta.monthly_cap_usd);
  const budgetUsd = Number.isFinite(capUsd) ? capUsd : DEFAULT_AGENT.monthlyCapUsd;

  let agentId: string | null = null;
  try {
    const agent = await agent37.createAgent({
      template,
      resources: { cpu: shape.cpu, memory: shape.memory, disk: shape.disk },
      user: userId,
      metadata: { app_workspace: workspaceId },
      budget: { monthly_cap_micros: usdToMicros(budgetUsd) },
    });
    agentId = agent.id;

    const { error } = await db.from("agents").insert({
      agent37_id: agent.id,
      workspace_id: workspaceId,
      name: agent.name || null,
      status: agent.status,
      template: agent.template,
      cpu: agent.resources.cpu,
      memory: agent.resources.memory,
      disk: agent.resources.disk,
      created_by: userId,
      stripe_subscription_id: subscriptionId,
    });
    if (error) throw new Error(`mirror insert failed: ${error.message}`);
  } catch (e) {
    // Couldn't provision (e.g. empty wallet) — don't keep billing the customer.
    if (agentId) {
      try {
        await agent37.deleteAgent(agentId);
      } catch {
        /* best-effort */
      }
    }
    try {
      await stripe.subscriptions.cancel(subscriptionId);
    } catch {
      /* best-effort */
    }
    throw e;
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const db = createAdminClient();
  const { data: row } = await db
    .from("agents")
    .select("agent37_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();
  if (!row) return;

  try {
    await agent37.deleteAgent(row.agent37_id);
  } catch {
    /* the box may already be gone; still clear the mirror */
  }
  await db.from("agents").delete().eq("agent37_id", row.agent37_id);
}
