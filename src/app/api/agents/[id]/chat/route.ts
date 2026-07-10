import { dataPlaneFetch } from "@/lib/agent37";
import { getAgentRow, requireMember, requireUser } from "@/lib/auth";
import { ApiError, handleError, readJson } from "@/lib/http";
import { HOUSE_STYLE, HOUSE_STYLE_SEP } from "@/config/houseStyle";
import { ONBOARDING_INTAKE } from "@/config/onboarding";

type Ctx = { params: Promise<{ id: string }> };

// Streams one agent turn (SSE) from the instance's data plane to the browser.
// Members (admins and customers) may chat; the sk_live key never leaves the server.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { supabase, user } = await requireUser();
    const row = await getAgentRow(supabase, id);
    await requireMember(supabase, row.workspace_id, user.id);

    const { input, session_id, onboarding, files } = await readJson<{
      input?: string;
      session_id?: string;
      onboarding?: boolean;
      files?: string[];
    }>(request);
    const trimmed = (input || "").trim();
    if (!trimmed) throw new ApiError(400, "invalid_request", "input is required");

    // Attachments the browser already uploaded via the files route — pass their
    // workspace paths through; the agent reads them from disk alongside the text.
    const attachments = Array.isArray(files) ? files.filter((f) => typeof f === "string" && f) : [];

    // Frame the first message of a new thread with Workify guidance so the agent
    // meets non-technical users at their level. A "Get started" click sends the
    // onboarding intake (which drives a guided discovery); every other new thread
    // gets the house style. Continuing threads keep the tone via session context,
    // so we only prepend when starting fresh.
    const preamble = onboarding ? ONBOARDING_INTAKE : HOUSE_STYLE;
    const outgoing = session_id ? trimmed : `${preamble}${HOUSE_STYLE_SEP}${trimmed}`;

    const upstream = await dataPlaneFetch(id, "/responses", {
      method: "POST",
      signal: request.signal,
      body: JSON.stringify({
        input: outgoing,
        ...(attachments.length ? { files: attachments } : {}),
        ...(session_id ? { session_id } : {}),
        // Apply the admin-chosen model, if any, as a per-turn override.
        ...(row.model ? { model: row.model } : {}),
        ...(row.provider ? { provider: row.provider } : {}),
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      let message = `Agent is not reachable (HTTP ${upstream.status})`;
      let code = "agent_unreachable";
      try {
        const body = JSON.parse(text) as { error?: { code?: string; message?: string } };
        if (body.error?.message) message = body.error.message;
        if (body.error?.code) code = body.error.code;
      } catch {
        /* non-JSON upstream error */
      }
      throw new ApiError(upstream.status === 409 ? 409 : 502, code, message);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
