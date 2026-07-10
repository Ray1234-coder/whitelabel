"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { apiFetch } from "@/lib/api";
import type { DirectoryUser, Invitation, Role, WorkspaceMember } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

export function MembersView() {
  const { current } = useWorkspace();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [role, setRole] = useState<Role>("admin");
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<Role>("customer");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!current) return;
    try {
      const data = await apiFetch<{ members: WorkspaceMember[]; invitations: Invitation[]; role: Role }>(
        `/api/workspaces/${current.id}/members`
      );
      setMembers(data.members);
      setInvitations(data.invitations);
      setRole(data.role);
      if (data.role === "admin") {
        try {
          const dir = await apiFetch<{ users: DirectoryUser[] }>("/api/users");
          setDirectory(dir.users);
        } catch {
          /* directory is admin-only sugar — the page works without it */
        }
      }
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

  const isAdmin = role === "admin";

  function inviteUrl(token: string) {
    return `${window.location.origin}/invite/${token}`;
  }

  async function createInvite() {
    if (!current) return;
    setBusy(true);
    try {
      const { url } = await apiFetch<{ url: string }>(`/api/workspaces/${current.id}/members`, {
        method: "POST",
        body: JSON.stringify({ role: inviteRole }),
      });
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Invite link created and copied");
      setInviteOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addUser(userId: string, email: string) {
    if (!current) return;
    setAdding(userId);
    try {
      await apiFetch(`/api/workspaces/${current.id}/members`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId, role: "customer" }),
      });
      toast.success(`${email} added to ${current.name}`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAdding(null);
    }
  }

  async function removeMember(userId: string) {
    if (!current) return;
    try {
      await apiFetch(`/api/workspaces/${current.id}/members/${userId}`, { method: "DELETE" });
      toast.success("Member removed");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function revokeInvite(token: string) {
    if (!current) return;
    try {
      await apiFetch(`/api/workspaces/${current.id}/invitations/${token}`, { method: "DELETE" });
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!current) return <p className="text-sm text-muted-foreground">No workspace selected.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground">{current.name}</p>
        </div>
        {isAdmin && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4" />
                Invite member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite member</DialogTitle>
                <DialogDescription>
                  Create an invite link and share it. Anyone who opens it joins this workspace as an
                  {inviteRole === "admin" ? " admin." : " customer."}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                    inviteRole === "customer"
                      ? "border-primary bg-muted"
                      : "border-input hover:bg-muted/60"
                  }`}
                  onClick={() => setInviteRole("customer")}
                >
                  <span className="block font-medium">Customer</span>
                  <span className="mt-1 block text-muted-foreground">
                    Can access assigned agents, but cannot manage members or create agents.
                  </span>
                </button>
                <button
                  type="button"
                  className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                    inviteRole === "admin"
                      ? "border-primary bg-muted"
                      : "border-input hover:bg-muted/60"
                  }`}
                  onClick={() => setInviteRole("admin")}
                >
                  <span className="block font-medium">Admin</span>
                  <span className="mt-1 block text-muted-foreground">
                    Can manage agents, members, invitations, and workspace settings.
                  </span>
                </button>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={createInvite} disabled={busy}>
                  {busy ? "Creating..." : "Create invite link"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Added</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id} className="border-t">
                    <td className="px-4 py-3 font-medium">{m.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant={m.role === "admin" ? "default" : "secondary"}>
                        {m.role === "admin" ? "Admin" : "Customer"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(m.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove member"
                          onClick={() => removeMember(m.user_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isAdmin && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">Users</h2>
              <p className="text-xs text-muted-foreground">
                Everyone who has signed up. Add someone to put them in this workspace — until
                then they see &ldquo;no active workspace&rdquo; when they log in.
              </p>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Email</th>
                      <th className="px-4 py-2.5 font-medium">Signed up</th>
                      <th className="px-4 py-2.5 font-medium">Workspaces</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {directory.map((u) => {
                      const isMemberHere = members.some((m) => m.user_id === u.user_id);
                      return (
                        <tr key={u.user_id} className="border-t">
                          <td className="px-4 py-3 font-medium">{u.email}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(u.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            {u.workspace_count === 0 ? (
                              <Badge variant="warning">No workspace</Badge>
                            ) : (
                              <span className="text-muted-foreground">{u.workspace_count}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isMemberHere ? (
                              <span className="text-xs text-muted-foreground">In this workspace</span>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={adding === u.user_id}
                                onClick={() => addUser(u.user_id, u.email)}
                              >
                                <UserPlus className="h-4 w-4" />
                                {adding === u.user_id ? "Adding…" : "Add to workspace"}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {isAdmin && invitations.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">Pending invitations</h2>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Invite link</th>
                      <th className="px-4 py-2.5 font-medium">Created</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((inv) => (
                      <tr key={inv.token} className="border-t">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          …/invite/{inv.token.slice(0, 8)}
                          <Badge className="ml-2" variant={inv.role === "admin" ? "default" : "secondary"}>
                            {inv.role === "admin" ? "Admin" : "Customer"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Copy invite link"
                            onClick={() => {
                              navigator.clipboard.writeText(inviteUrl(inv.token));
                              toast.success("Link copied");
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Revoke invite"
                            onClick={() => revokeInvite(inv.token)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
