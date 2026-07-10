import "server-only";
import Stripe from "stripe";

// Server-side Stripe client. The secret key never reaches the browser. Billing is
// optional: if STRIPE_SECRET_KEY isn't set, the app runs fine and the billing UI
// shows a "not set up yet" state instead of erroring.
const secretKey = process.env.STRIPE_SECRET_KEY;

export function stripeConfigured(): boolean {
  return !!secretKey;
}

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set on the server");
  }
  if (!client) client = new Stripe(secretKey);
  return client;
}
