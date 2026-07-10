import { createAdminClient } from "@/lib/supabase/admin";
import { runAutomation, type AutomationRow } from "@/lib/automations";

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
    .select("id, workspace_id, agent37_id, instructions, cadence, enabled, trigger_type")
    .eq("webhook_token", token)
    .eq("trigger_type", "webhook")
    .maybeSingle();

  if (!auto) return new Response("unknown or disabled webhook", { status: 404 });
  if (!auto.enabled) return new Response("automation is turned off", { status: 200 });

  // Capture whatever was sent (JSON or text) as the event context.
  const contextText = (await request.text().catch(() => "")).slice(0, 8000) || "(empty request)";

  // Run synchronously (serverless would freeze a floating promise after the
  // response). Fine for typical sources; very latency-sensitive callers like
  // Twilio would want a queue in front — a later upgrade.
  try {
    const result = await runAutomation(auto as AutomationRow, contextText);
    return Response.json({ received: true, ...result });
  } catch {
    return new Response("received", { status: 200 });
  }
}
