import { agent37 } from "@/lib/agent37";
import { requireAdmin, requireUser } from "@/lib/auth";
import { ApiError, handleError, json } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; connId: string }> };

// Remove a custom connector: delete the key + skill from the agent's disk
// (best-effort — the box may be replaced/asleep), then drop the registry row.
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId, connId } = await params;
    const { supabase, user } = await requireUser();
    await requireAdmin(supabase, workspaceId, user.id);

    const { data: row } = await supabase
      .from("custom_connectors")
      .select("agent37_id, slug")
      .eq("id", connId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!row) throw new ApiError(404, "not_found", "Connector not found");

    let startedIt = false;
    try {
      const live = await agent37.getAgent(row.agent37_id);
      startedIt = live.status !== "running";
      if (startedIt) await agent37.start(row.agent37_id);
      for (let i = 0; i < 15; i++) {
        try {
          const r = await agent37.exec(row.agent37_id, "echo ready");
          if ((r.stdout || r.output || "").includes("ready")) break;
        } catch {
          /* booting */
        }
        await new Promise((res) => setTimeout(res, 4000));
      }
      await agent37.exec(
        row.agent37_id,
        `rm -f ~/.connectors/${row.slug}.env && rm -rf ~/.hermes/skills/${row.slug} && echo removed`
      );
    } catch {
      /* best-effort cleanup on the box */
    } finally {
      if (startedIt) {
        try {
          await agent37.stop(row.agent37_id);
        } catch {
          /* best-effort */
        }
      }
    }

    const { error } = await supabase
      .from("custom_connectors")
      .delete()
      .eq("id", connId)
      .eq("workspace_id", workspaceId);
    if (error) throw new ApiError(500, "db_error", error.message);

    return json({ id: connId, deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
