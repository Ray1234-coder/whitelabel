import { dataPlaneFetch } from "@/lib/agent37";
import { getAgentRow, requireMember, requireUser } from "@/lib/auth";
import { ApiError, handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; sessionId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id, sessionId } = await params;
    const { supabase, user } = await requireUser();
    const row = await getAgentRow(supabase, id);
    await requireMember(supabase, row.workspace_id, user.id);

    if (!/^[a-f0-9]{32}$/i.test(sessionId)) {
      throw new ApiError(400, "invalid_request", "Invalid session id");
    }

    const upstream = await dataPlaneFetch(id, `/sessions/${sessionId}`);
    if (upstream.status === 404) throw new ApiError(404, "not_found", "Session not found");
    if (!upstream.ok) {
      throw new ApiError(502, "agent_unreachable", `Agent is not reachable (HTTP ${upstream.status})`);
    }
    return json(await upstream.json());
  } catch (e) {
    return handleError(e);
  }
}
