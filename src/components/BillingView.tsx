"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, ExternalLink, Headset } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomerAddAgentButton } from "@/components/CustomerAddAgentButton";

interface Subscription {
  id: string;
  status: string;
  amount: number;
  agentName: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

interface BillingData {
  configured: boolean;
  hasAccount?: boolean;
  subscriptions: Subscription[];
}

function fmtDate(epochSeconds: number | null) {
  if (!epochSeconds) return "";
  return new Date(epochSeconds * 1000).toLocaleDateString();
}

export function BillingView() {
  const { current } = useWorkspace();
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalBusy, setPortalBusy] = useState(false);

  const load = useCallback(async () => {
    if (!current) return;
    try {
      const d = await apiFetch<BillingData>(`/api/workspaces/${current.id}/billing`);
      setData(d);
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

  // One-time toast on return from Stripe checkout.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout === "success") {
      toast.success("Payment received — your agent is being set up.");
    } else if (checkout === "cancel") {
      toast("Checkout canceled — no charge was made.");
    }
    if (checkout) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function openPortal() {
    if (!current) return;
    setPortalBusy(true);
    try {
      const { url } = await apiFetch<{ url: string }>(
        `/api/workspaces/${current.id}/billing/portal`,
        { method: "POST" }
      );
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message);
      setPortalBusy(false);
    }
  }

  if (!current) return <p className="text-sm text-muted-foreground">No workspace selected.</p>;

  const isAdmin = current.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground">{current.name}</p>
        </div>
        {data?.configured && <CustomerAddAgentButton workspaceId={current.id} />}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data?.configured ? (
        <div className="rounded-lg border bg-muted/40 p-6 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <CreditCard className="h-4 w-4" />
            Billing isn&apos;t set up yet
          </div>
          <p className="mt-2 text-muted-foreground">
            {isAdmin
              ? "Add your Stripe keys to the app's environment (STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET) to let members add and pay for their own agents."
              : "Your workspace admin hasn't enabled billing yet. Once they do, you'll be able to add and pay for your own agents here."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
            <Headset className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>
              Every agent you add includes <span className="font-medium">24/7 customer support</span> with
              help setting it up. Add an agent above and pay securely with Stripe — cancel any time.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">Your agent subscriptions</h2>
              {data.hasAccount && (
                <Button variant="outline" size="sm" onClick={openPortal} disabled={portalBusy}>
                  <ExternalLink className="h-4 w-4" />
                  {portalBusy ? "Opening…" : "Manage billing"}
                </Button>
              )}
            </div>

            {data.subscriptions.length === 0 ? (
              <div className="rounded-lg border bg-muted/40 p-6 text-sm text-muted-foreground">
                You don&apos;t have any agent subscriptions yet. Click <span className="font-medium">Add agent</span> to
                create one.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Agent</th>
                      <th className="px-4 py-2.5 font-medium">Price</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium">Renews</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subscriptions.map((s) => (
                      <tr key={s.id} className="border-t">
                        <td className="px-4 py-3 font-medium">{s.agentName}</td>
                        <td className="px-4 py-3 tabular-nums">${s.amount.toFixed(2)}/mo</td>
                        <td className="px-4 py-3">
                          <Badge variant={s.status === "active" ? "default" : "secondary"}>
                            {s.cancelAtPeriodEnd ? "Cancels soon" : s.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {fmtDate(s.currentPeriodEnd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
