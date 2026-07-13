import { createHmac, timingSafeEqual } from "crypto";
import { runEventTriggers } from "@/lib/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Slack Events API receiver. Point a Slack app's Event Subscriptions request
// URL here; SLACK_SIGNING_SECRET (from the app's Basic Information page)
// verifies every request. Fires any tested, enabled workflow subscribed to
// event_source 'slack' (optionally filtered by event type, e.g. app_mention).
export async function POST(request: Request) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return new Response("slack not configured", { status: 503 });

  const ts = request.headers.get("x-slack-request-timestamp") || "";
  const sig = request.headers.get("x-slack-signature") || "";
  const raw = await request.text();

  // Replay protection: reject unsigned or stale (>5 min) requests.
  if (!ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
    return new Response("stale or unsigned", { status: 400 });
  }
  const expected =
    "v0=" + createHmac("sha256", secret).update(`v0:${ts}:${raw}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("bad signature", { status: 401 });
  }

  let payload: {
    type?: string;
    challenge?: string;
    event?: { type?: string; bot_id?: string; [k: string]: unknown };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  // One-time handshake when the URL is saved in the Slack app config.
  if (payload.type === "url_verification") {
    return Response.json({ challenge: payload.challenge });
  }

  // We run workflows synchronously, which can exceed Slack's 3s ack window —
  // Slack then retries. The first delivery did the work; ignore retries.
  if (request.headers.get("x-slack-retry-num")) {
    return new Response("ok (retry ignored)", { status: 200 });
  }

  if (payload.type === "event_callback" && payload.event?.type) {
    // Ignore bot-authored events so an agent posting to Slack can't trigger itself.
    if (payload.event.bot_id) return new Response("ok (bot event)", { status: 200 });
    try {
      const ran = await runEventTriggers(
        "slack",
        payload.event.type,
        JSON.stringify(payload.event).slice(0, 8000)
      );
      return Response.json({ ok: true, ran });
    } catch (e) {
      console.error("[slack events] dispatch failed:", e);
      return new Response("ok (dispatch error logged)", { status: 200 });
    }
  }

  return new Response("ok", { status: 200 });
}
