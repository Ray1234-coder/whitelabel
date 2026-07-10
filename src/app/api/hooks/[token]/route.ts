import { createAdminClient } from "@/lib/supabase/admin";
import { runAutomation } from "@/lib/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ token: string }> };

// Public inbound webhook. Any external service (Twilio, a form, Zapier, a review
// platform, etc.) POSTs here; the token identifies the automation. Unauthenticated
// by design — the unguessable token is the credential. The body becomes the event
// context the agent reads. No session, so it uses the service-role client.
export async function POST(request: Request, { params }: Ctx) {
  const { token } = await params;
  const db = createAdminClient();

  const { data: auto } = await db
    .from("automations")
    .select("id, enabled, tested_at")
    .eq("webhook_token", token)
    .eq("trigger_type", "webhook")
    .maybeSingle();

  if (!auto) return new Response("unknown or disabled webhook", { status: 404 });
  if (!auto.enabled) return new Response("automation is turned off", { status: 200 });
  if (!auto.tested_at) return new Response("workflow not tested yet", { status: 409 });

  // Capture whatever was sent (JSON or text) as the event context.
  const contextText = (await request.text().catch(() => "")).slice(0, 8000) || "(empty request)";

  // Run synchronously (serverless would freeze a floating promise after the
  // response). Fine for typical sources; very latency-sensitive callers like
  // Twilio would want a queue in front — a later upgrade.
  try {
    const result = await runAutomation(auto.id, { mode: "run", contextText });
    return Response.json({ received: true, status: result.status });
  } catch {
    return new Response("received", { status: 200 });
  }
}
