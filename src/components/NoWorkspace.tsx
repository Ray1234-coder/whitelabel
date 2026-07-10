"use client";

import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { branding } from "@/config/branding";
import { Button } from "@/components/ui/button";

export function NoWorkspace({ userEmail }: { userEmail: string }) {
  async function signOut() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold tracking-tight">{branding.appName}</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;re signed in as {userEmail}, but you haven&apos;t been added to a workspace
          yet. Ask your administrator for an invite link.
        </p>
        <Button variant="outline" onClick={signOut}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </main>
  );
}
