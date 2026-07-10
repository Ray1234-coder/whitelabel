import { requireMember, requireUser } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";

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

    return json({ content: text });
  } catch (e) {
    return handleError(e);
  }
}
