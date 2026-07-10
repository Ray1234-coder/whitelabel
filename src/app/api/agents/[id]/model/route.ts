import { dataPlaneFetch } from "@/lib/agent37";
import { getAgentRow, requireAdmin, requireUser } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import type { ModelsResponse } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

// Admin sets the agent's model. Stored on the row and applied as a per-turn
// override on every chat request. Pass { model: null } to reset to the default.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { supabase, user } = await requireUser();
    const row = await getAgentRow(supabase, id);
    await requireAdmin(supabase, row.workspace_id, user.id);

    const { model, provider } = await readJson<{ model?: string | null; provider?: string | null }>(
      request
    );

    // Reset to default.
    if (!model) {
      const { error } = await supabase
        .from("agents")
        .update({ model: null, provider: null })
        .eq("agent37_id", id);
      if (error) throw new ApiError(500, "db_error", error.message);
      return json({ id, model: null, provider: null });
    }

    // Best-effort validation against the live catalog. If the agent is awake and
    // the model isn't offered, reject; if it's asleep, trust the client (its list
    // came from the same catalog) rather than block a valid change.
    let resolvedProvider = provider ?? null;
    const res = await dataPlaneFetch(id, "/models");
    if (res.ok) {
      const catalog = (await res.json()) as ModelsResponse;
      const match = catalog.data?.find((m) => m.id === model);
      if (!match) {
        throw new ApiError(400, "invalid_request", `Model "${model}" is not available for this agent`);
      }
      resolvedProvider = provider ?? match.owned_by ?? catalog.default_provider ?? null;
    }

    const { error } = await supabase
      .from("agents")
      .update({ model, provider: resolvedProvider })
      .eq("agent37_id", id);
    if (error) throw new ApiError(500, "db_error", error.message);

    return json({ id, model, provider: resolvedProvider });
  } catch (e) {
    return handleError(e);
  }
}
