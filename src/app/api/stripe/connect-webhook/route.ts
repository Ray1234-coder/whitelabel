import type Stripe from "stripe";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { runEventTriggers } from "@/lib/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Events from customers' CONNECTED Stripe accounts (event.account = acct_…).
// Each event is mapped to the workspace that linked that account and dispatched
// only to that workspace's Stripe-event workflows — tenants never see each
// other's events. Separate endpoint + secret from the platform billing webhook.
export async function POST(request: Request) {
  if (!stripeConfigured()) return new Response("billing not configured", { status: 503 });
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) return new Response("connect webhook secret not set", { status: 500 });

  const sig = request.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    return new Response(`signature verification failed: ${(e as Error).message}`, { status: 400 });
  }

  const account = event.account;
  if (!account) return new Response("ok (no account)", { status: 200 });

  const db = createAdminClient();

  try {
    // Customer revoked access in their Stripe dashboard — drop the mapping.
    if (event.type === "account.application.deauthorized") {
      await db.from("stripe_connections").delete().eq("stripe_account_id", account);
      return new Response("ok (deauthorized)", { status: 200 });
    }

    const { data: conn } = await db
      .from("stripe_connections")
      .select("workspace_id")
      .eq("stripe_account_id", account)
      .maybeSingle();
    if (!conn) return new Response("ok (unknown account)", { status: 200 });

    const ran = await runEventTriggers(
      "stripe",
      event.type,
      JSON.stringify(event.data.object).slice(0, 8000),
      conn.workspace_id
    );
    return Response.json({ ok: true, ran });
  } catch (e) {
    console.error(`[stripe connect-webhook] ${event.type} failed:`, e);
    return new Response("handler error", { status: 500 });
  }
}
