import { createAdminClient } from "@/lib/supabase/admin";
import { CADENCE_MS, nextRunFromNow, runAutomation, type Cadence } from "@/lib/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Called on a schedule by Vercel Cron (see vercel.json). Runs every scheduled
// automation that's due, then advances its next_run_at. Due runs are concurrent:
// processing them serially can multiply agent latency past Vercel's five-minute
// function limit. Protected by CRON_SECRET: Vercel sends it as a Bearer token;
// we also accept ?key= for manual/external cron.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    const key = new URL(request.url).searchParams.get("key");
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return new Response("unauthorized", { status: 401 });
    }
  }

  const db = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await db
    .from("automations")
    .select("id, cadence")
    .eq("trigger_type", "schedule")
    .eq("enabled", true)
    .not("tested_at", "is", null)
    .lte("next_run_at", nowIso)
    .limit(25);

  if (error) return new Response(`db error: ${error.message}`, { status: 500 });
  if (!due || due.length === 0) return Response.json({ ran: 0 });

  const results = await Promise.all(
    due.map(async (auto) => {
      const cadence =
        (auto.cadence as Cadence) in CADENCE_MS ? (auto.cadence as Cadence) : "daily";
      // Advance next_run_at first so a slow run can't be double-picked by an overlap.
      await db
        .from("automations")
        .update({ next_run_at: nextRunFromNow(cadence, Date.now()) })
        .eq("id", auto.id);
      try {
        await runAutomation(auto.id, { mode: "run" });
        return true;
      } catch {
        // runAutomation logs its own failures.
        return false;
      }
    })
  );

  return Response.json({ ran: results.filter(Boolean).length, checked: due.length });
}
