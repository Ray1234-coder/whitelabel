"use client";

import { useCallback, useEffect, useState } from "react";
import { Plug, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { MergedAgent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Connector {
  id: string;
  agent37_id: string;
  slug: string;
  name: string;
  base_url: string;
  auth_scheme: string;
  auth_name: string | null;
  secret_hint: string | null;
  created_at: string;
}

const AUTH_SCHEMES = [
  { id: "bearer", label: "Bearer token (Authorization: Bearer …)" },
  { id: "header", label: "API key in a custom header" },
  { id: "query", label: "API key in the URL (?key=…)" },
  { id: "none", label: "No authentication" },
] as const;

// Admin-only: add an API connection Composio doesn't offer (e.g. snov.io).
// The key is installed onto the agent's disk with a generated skill; it is
// never stored in the database.
export function CustomConnectorsCard({ workspaceId }: { workspaceId: string }) {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [agents, setAgents] = useState<MergedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [agentId, setAgentId] = useState("");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [authScheme, setAuthScheme] = useState("bearer");
  const [authName, setAuthName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([
        apiFetch<{ connectors: Connector[] }>(`/api/workspaces/${workspaceId}/connectors`),
        apiFetch<{ agents: MergedAgent[] }>(`/api/agents?workspace=${workspaceId}`),
      ]);
      setConnectors(c.connectors);
      setAgents(a.agents);
      setAgentId((prev) => prev || a.agents[0]?.agent37_id || "");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!name.trim() || !baseUrl.trim() || !agentId) {
      toast.error("Name, website API address, and an agent are required.");
      return;
    }
    if (authScheme !== "none" && !apiKey.trim()) {
      toast.error("Paste the API key for this service.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/workspaces/${workspaceId}/connectors`, {
        method: "POST",
        body: JSON.stringify({
          agent37_id: agentId,
          name: name.trim(),
          base_url: baseUrl.trim(),
          auth_scheme: authScheme,
          auth_name: authName.trim() || undefined,
          api_key: apiKey.trim() || undefined,
          notes,
        }),
      });
      toast.success(`${name.trim()} connected — the agent can use it now.`);
      setName("");
      setBaseUrl("");
      setApiKey("");
      setAuthName("");
      setNotes("");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Connector) {
    try {
      await apiFetch(`/api/workspaces/${workspaceId}/connectors/${c.id}`, { method: "DELETE" });
      toast.success(`${c.name} removed`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="rounded-lg border p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Plug className="h-4 w-4" />
        Custom connections
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect an API the built-in catalog doesn&apos;t cover (e.g. snov.io). The key is stored
        only on the agent, never in our database. Installing may take a minute if the agent is
        asleep.
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {connectors.length > 0 && (
            <div className="mt-3 space-y-2">
              {connectors.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.base_url} · key {c.secret_hint || "none"} · on {c.agent37_id}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`Remove ${c.name}`} onClick={() => remove(c)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cc-name">Service name</Label>
                <Input id="cc-name" placeholder="e.g. Snov.io" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cc-agent">Install on agent</Label>
                <select
                  id="cc-agent"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  disabled={busy}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {agents.map((a) => (
                    <option key={a.agent37_id} value={a.agent37_id}>
                      {a.name || a.agent37_id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cc-url">API base address</Label>
              <Input id="cc-url" placeholder="https://api.snov.io/v2" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} disabled={busy} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cc-scheme">How it authenticates</Label>
                <select
                  id="cc-scheme"
                  value={authScheme}
                  onChange={(e) => setAuthScheme(e.target.value)}
                  disabled={busy}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {AUTH_SCHEMES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              {(authScheme === "header" || authScheme === "query") && (
                <div className="space-y-1">
                  <Label htmlFor="cc-authname">{authScheme === "header" ? "Header name" : "Query parameter name"}</Label>
                  <Input id="cc-authname" placeholder={authScheme === "header" ? "X-API-Key" : "api_key"} value={authName} onChange={(e) => setAuthName(e.target.value)} disabled={busy} />
                </div>
              )}
            </div>
            {authScheme !== "none" && (
              <div className="space-y-1">
                <Label htmlFor="cc-key">API key</Label>
                <Input id="cc-key" type="password" placeholder="Paste the service's API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={busy} />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="cc-notes">API notes for the agent (optional)</Label>
              <textarea
                id="cc-notes"
                rows={3}
                placeholder="Paste useful endpoints or docs, e.g. GET /emails/verify?email=…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={busy}
                className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
              />
            </div>
            <Button onClick={add} disabled={busy}>
              {busy ? "Installing on the agent…" : "Add connection"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
