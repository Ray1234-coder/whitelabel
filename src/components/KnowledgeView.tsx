"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

// A starter template shown when the knowledge base is empty, so the business
// knows what's useful to tell the agent about them.
const TEMPLATE = `About us:
- What we do:
- Who our customers are:
- Our locations / hours:

How we talk:
- Tone / voice (e.g. friendly, professional):
- Things to always mention:
- Things to never say or do:

Key facts the agent should know:
- Services & prices:
- Booking / contact details:
- Common questions & answers:
`;

export function KnowledgeView() {
  const { current } = useWorkspace();
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!current) return;
    try {
      const d = await apiFetch<{ content: string; updated_at: string | null }>(
        `/api/workspaces/${current.id}/knowledge`
      );
      setContent(d.content);
      setSaved(d.content);
      setUpdatedAt(d.updated_at);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [current]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function save() {
    if (!current) return;
    setSaving(true);
    try {
      await apiFetch(`/api/workspaces/${current.id}/knowledge`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      });
      setSaved(content);
      setUpdatedAt(new Date().toISOString());
      toast.success("Saved — your agents will use this.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!current) return <p className="text-sm text-muted-foreground">No workspace selected.</p>;

  const dirty = content !== saved;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <BookOpen className="h-6 w-6" />
            Knowledge base
          </h1>
          <p className="text-sm text-muted-foreground">
            What your agents know about {current.name}. Edit it any time — every agent and workflow uses
            this as background.
          </p>
        </div>
        <Button onClick={save} disabled={saving || !dirty}>
          {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={TEMPLATE}
            rows={22}
            className="w-full resize-y rounded-lg border bg-background p-4 font-mono text-sm leading-relaxed focus:border-ring focus:outline-none"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {content.length.toLocaleString()} characters
              {updatedAt ? ` · last saved ${new Date(updatedAt).toLocaleString()}` : ""}
            </span>
            {content.trim().length === 0 && (
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => setContent(TEMPLATE)}
              >
                Start from a template
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
