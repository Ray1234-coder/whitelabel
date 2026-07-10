import { randomUUID } from "crypto";
import { dataPlaneFetch } from "@/lib/agent37";
import { getAgentRow, requireMember, requireUser } from "@/lib/auth";
import { ApiError, handleError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// Cap uploads to keep a single chat attachment reasonable. The upstream API
// documents no hard limit, but we don't want to proxy arbitrarily large bodies.
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

// Uploads one file into the agent's workspace so it can be attached to a chat
// message. The browser POSTs multipart/form-data ("file"); we stream the bytes
// to the instance's data plane and return the resolved path the agent reads from.
// Members (admins and customers) may upload; the sk_live key never leaves the server.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { supabase, user } = await requireUser();
    const row = await getAgentRow(supabase, id);
    await requireMember(supabase, row.workspace_id, user.id);

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      throw new ApiError(400, "invalid_request", "No file was provided.");
    }
    if (file.size === 0) throw new ApiError(400, "invalid_request", "That file is empty.");
    if (file.size > MAX_BYTES) {
      throw new ApiError(413, "file_too_large", "That file is too large (25 MB max).");
    }

    // Keep the original name (so the agent can refer to it) but strip anything
    // path-like or unsafe, and drop it under a unique folder to avoid collisions.
    const base =
      (file.name || "file").replace(/[/\\]/g, "_").replace(/[^\w.\- ]+/g, "_").slice(-100) ||
      "file";
    const uploadPath = `uploads/${randomUUID().slice(0, 8)}/${base}`;

    const bytes = Buffer.from(await file.arrayBuffer());
    const upstream = await dataPlaneFetch(
      id,
      `/files/content?path=${encodeURIComponent(uploadPath)}`,
      {
        method: "PUT",
        signal: request.signal,
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: bytes,
      }
    );

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      let message = `Upload failed (HTTP ${upstream.status})`;
      let code = "upload_failed";
      try {
        const body = JSON.parse(text) as { error?: { code?: string; message?: string } };
        if (body.error?.message) message = body.error.message;
        if (body.error?.code) code = body.error.code;
      } catch {
        /* non-JSON upstream error */
      }
      throw new ApiError(upstream.status === 409 ? 409 : 502, code, message);
    }

    const entry = (await upstream.json().catch(() => ({}))) as {
      path?: string;
      name?: string;
      size?: number;
    };
    if (!entry.path) {
      throw new ApiError(502, "upload_failed", "The agent did not confirm the upload.");
    }

    return Response.json({ path: entry.path, name: entry.name ?? base, size: entry.size ?? bytes.length });
  } catch (e) {
    return handleError(e);
  }
}
