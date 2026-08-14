import { agent37 } from "@/lib/agent37";
import { requireAdmin, requireUser } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// Custom connectors (admin-only): teach an agent to call an API Composio
// doesn't cover. The key is written to the agent's persistent disk and a
// Hermes skill is generated so the agent knows how to use it. The key is
// never stored in our database — only a last-4 hint for the UI.

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId } = await params;
    const { supabase, user } = await requireUser();
    await requireAdmin(supabase, workspaceId, user.id);

    const { data, error } = await supabase
      .from("custom_connectors")
      .select("id, agent37_id, slug, name, base_url, auth_scheme, auth_name, secret_hint, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new ApiError(500, "db_error", error.message);
    return json({ connectors: data ?? [] });
  } catch (e) {
    return handleError(e);
  }
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

function skillMarkdown(opts: {
  name: string;
  slug: string;
  baseUrl: string;
  authScheme: string;
  authName: string | null;
  notes: string;
}): string {
  const { name, slug, baseUrl, authScheme, authName, notes } = opts;
  const envVar = `${slug.toUpperCase().replace(/-/g, "_")}_API_KEY`;
  const load = `KEY=$(grep '^${envVar}=' ~/.connectors/${slug}.env | cut -d= -f2-)`;
  const auth =
    authScheme === "bearer"
      ? `-H "Authorization: Bearer $KEY"`
      : authScheme === "header"
        ? `-H "${authName || "X-API-Key"}: $KEY"`
        : authScheme === "query"
          ? `(append ?${authName || "api_key"}=$KEY to the URL)`
          : "(no authentication needed)";
  return `# ${name} (custom connection)

This business has a custom connection to ${name}. Use it when they ask for
anything involving ${name} — do NOT say you can't connect to it.

Base URL: ${baseUrl}

How to authenticate every request:
\`\`\`bash
${load}
curl -sS ${authScheme === "query" ? `"${baseUrl}/ENDPOINT?${authName || "api_key"}=$KEY"` : `${auth} "${baseUrl}/ENDPOINT"`}
\`\`\`

Never print, echo, or include the key itself in any reply to the user.

API notes from the workspace admin:
${notes || "(none provided — explore the API's public docs if needed)"}
`;
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id: workspaceId } = await params;
    const { supabase, user } = await requireUser();
    await requireAdmin(supabase, workspaceId, user.id);

    const body = await readJson<{
      agent37_id?: string;
      name?: string;
      base_url?: string;
      auth_scheme?: string;
      auth_name?: string;
      api_key?: string;
      notes?: string;
    }>(request);

    const name = (body.name || "").trim();
    const baseUrl = (body.base_url || "").trim().replace(/\/$/, "");
    const authScheme = body.auth_scheme || "bearer";
    const authName = (body.auth_name || "").trim() || null;
    const apiKey = (body.api_key || "").trim();
    const notes = (body.notes || "").trim().slice(0, 6000);
    const agentId = body.agent37_id;

    if (!name || !baseUrl || !agentId) {
      throw new ApiError(400, "invalid_request", "name, base_url and agent are required");
    }
    if (!/^https:\/\/[\w.-]+/.test(baseUrl)) {
      throw new ApiError(400, "invalid_request", "base_url must start with https://");
    }
    if (!["bearer", "header", "query", "none"].includes(authScheme)) {
      throw new ApiError(400, "invalid_request", "invalid auth_scheme");
    }
    if (authScheme !== "none" && !apiKey) {
      throw new ApiError(400, "invalid_request", "api_key is required for this auth type");
    }

    // Agent must belong to this workspace.
    const { data: agentRow } = await supabase
      .from("agents")
      .select("agent37_id")
      .eq("agent37_id", agentId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!agentRow) throw new ApiError(404, "not_found", "Agent not found in this workspace");

    const slug =
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) ||
      "connector";

    // Make sure the agent is up; remember whether we started it.
    const live = await agent37.getAgent(agentId);
    const startedIt = live.status !== "running";
    if (startedIt) await agent37.start(agentId);

    const execReady = async () => {
      for (let i = 0; i < 20; i++) {
        try {
          const r = await agent37.exec(agentId, "echo ready");
          if ((r.stdout || r.output || "").includes("ready")) return true;
        } catch {
          /* still booting */
        }
        await new Promise((res) => setTimeout(res, 4000));
      }
      return false;
    };

    try {
      if (!(await execReady())) {
        throw new ApiError(502, "agent_unreachable", "The agent didn't come online to install the connector.");
      }

      const envVar = `${slug.toUpperCase().replace(/-/g, "_")}_API_KEY`;
      const envContent = authScheme === "none" ? `${envVar}=none` : `${envVar}=${apiKey}`;
      const skill = skillMarkdown({ name, slug, baseUrl, authScheme, authName, notes });

      await agent37.exec(
        agentId,
        `mkdir -p ~/.connectors ~/.hermes/skills/${slug} && ` +
          `echo ${b64(envContent)} | base64 -d > ~/.connectors/${slug}.env && chmod 600 ~/.connectors/${slug}.env && ` +
          `echo ${b64(skill)} | base64 -d > ~/.hermes/skills/${slug}/SKILL.md && echo installed`
      );
      const check = await agent37.exec(
        agentId,
        `test -s ~/.connectors/${slug}.env && test -s ~/.hermes/skills/${slug}/SKILL.md && echo verified`
      );
      if (!(check.stdout || check.output || "").includes("verified")) {
        throw new ApiError(502, "install_failed", "Files did not land on the agent.");
      }
    } finally {
      if (startedIt) {
        try {
          await agent37.stop(agentId);
        } catch {
          /* best-effort */
        }
      }
    }

    const { data, error } = await supabase
      .from("custom_connectors")
      .upsert(
        {
          workspace_id: workspaceId,
          agent37_id: agentId,
          slug,
          name,
          base_url: baseUrl,
          auth_scheme: authScheme,
          auth_name: authName,
          secret_hint: apiKey ? `…${apiKey.slice(-4)}` : null,
          notes,
          created_by: user.id,
        },
        { onConflict: "workspace_id,slug" }
      )
      .select("id, slug, name")
      .single();
    if (error) throw new ApiError(500, "db_error", error.message);

    return json({ connector: data }, 201);
  } catch (e) {
    return handleError(e);
  }
}
