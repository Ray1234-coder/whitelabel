import { dataPlaneFetch } from "@/lib/agent37";
import { getAgentRow, requireMember, requireUser } from "@/lib/auth";
import { ApiError, handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { supabase, user } = await requireUser();
    const row = await getAgentRow(supabase, id);
    await requireMember(supabase, row.workspace_id, user.id);

    const upstream = await dataPlaneFetch(id, "/sessions");
    if (!upstream.ok) {
      throw new ApiError(502, "agent_unreachable", `Agent is not reachable (HTTP ${upstream.status})`);
    }
    return json(await upstream.json());
  } catch (e) {
    return handleError(e);
  }
}
