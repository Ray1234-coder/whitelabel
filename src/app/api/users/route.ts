import { requireUser } from "@/lib/auth";
import { ApiError, handleError, json } from "@/lib/http";
import type { DirectoryUser } from "@/lib/types";

// Directory of all signed-up accounts. The list_all_users function itself
// rejects callers who are not an admin of at least one workspace.
export async function GET() {
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("list_all_users");
    if (error) {
      const status = /admin required/.test(error.message) ? 403 : 500;
      throw new ApiError(status, status === 403 ? "forbidden" : "db_error", error.message);
    }
    return json({ users: (data as DirectoryUser[]) ?? [] });
  } catch (e) {
    return handleError(e);
  }
}
