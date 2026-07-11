import { requireMember, requireUser } from "@/lib/auth";
import { chunkText, embedTexts, embeddingsConfigured, toVectorLiteral } from "@/lib/embeddings";
import { ApiError, handleError, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

// The agent's knowledge about this company — an editable doc fed to the agent as
// context. Any member can read and edit it.
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId } = await params;
    const { supabase, user } = await requireUser();
    await requireMember(supabase, workspaceId, user.id);

    const { data } = await supabase
      .from("knowledge_base")
      .select("content, updated_at")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    return json({ content: data?.content ?? "", updated_at: data?.updated_at ?? null });
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId } = await params;
    const { supabase, user } = await requireUser();
    await requireMember(supabase, workspaceId, user.id);

    const { content } = await readJson<{ content?: string }>(request);
    const text = (content ?? "").slice(0, 20000);

    const { error } = await supabase.from("knowledge_base").upsert({
      workspace_id: workspaceId,
      content: text,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    });
    if (error) throw new ApiError(500, "db_error", error.message);

    // Re-index for RAG: chunk + embed + replace this workspace's chunks. Best
    // effort — if embeddings aren't configured or the call fails, we just fall
    // back to raw-text injection at chat time, so the save still succeeds.
    let indexed = 0;
    if (embeddingsConfigured()) {
      try {
        await supabase.from("kb_chunks").delete().eq("workspace_id", workspaceId);
        const chunks = chunkText(text);
        if (chunks.length > 0) {
          const vecs = await embedTexts(chunks);
          const rows = chunks.map((c, i) => ({
            workspace_id: workspaceId,
            content: c,
            embedding: toVectorLiteral(vecs[i]),
          }));
          const { error: insErr } = await supabase.from("kb_chunks").insert(rows);
          if (!insErr) indexed = rows.length;
        }
      } catch (e) {
        console.error("[knowledge] RAG reindex failed:", e);
      }
    }

    return json({ content: text, indexed });
  } catch (e) {
    return handleError(e);
  }
}
