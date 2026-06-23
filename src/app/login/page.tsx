"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { branding } from "@/config/branding";
import { toast } from "sonner";

type AuthMode = "sign-in" | "sign-up";
type PageMode = AuthMode | "recovery";

export default function LoginPage() {
  const router = useRouter();
  const [next, setNext] = useState("/dashboard");
  const [authError, setAuthError] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<PageMode>("sign-in");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const supabase = createClient();
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const hashType = hashParams.get("type");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (hashType === "recovery" && accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (mounted) {
          if (error) {
            setAuthError(true);
          } else {
            setMode("recovery");
            setMessage("Choose a new password for this account.");
            window.history.replaceState(null, "", window.location.pathname);
          }
        }
      }

      if (mounted) setReady(true);
    }

    const params = new URLSearchParams(window.location.search);
    setNext(params.get("next") || "/dashboard");
    setAuthError(params.has("error") || window.location.hash.includes("error="));
    init();

    return () => {
      mounted = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const trimmedEmail = email.trim();
    if ((!trimmedEmail && mode !== "recovery") || !password) return;
    setLoading(true);
    const supabase = createClient();

    if (mode === "recovery") {
      const { error } = await supabase.auth.updateUser({ password });
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Password updated.");
      router.push(next);
      router.refresh();
      return;
    }

    const result =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email: trimmedEmail, password })
        : await supabase.auth.signUp({
            email: trimmedEmail,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
            },
          });

    setLoading(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }

    if (result.data.session) {
      router.push(next);
      router.refresh();
      return;
    }

    setMessage("Account created. If email confirmation is still enabled in Supabase, confirm once, then sign in with your password.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{branding.appName}</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "recovery" ? "Choose a new password." : "Sign in with email and password."}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {mode !== "recovery" ? (
            <div className="grid grid-cols-2 rounded-md border bg-muted p-1">
              <Button
                type="button"
                variant={mode === "sign-in" ? "secondary" : "ghost"}
                className="h-8 shadow-none"
                onClick={() => setMode("sign-in")}
              >
                Sign in
              </Button>
              <Button
                type="button"
                variant={mode === "sign-up" ? "secondary" : "ghost"}
                className="h-8 shadow-none"
                onClick={() => setMode("sign-up")}
              >
                Sign up
              </Button>
            </div>
          ) : null}

          {authError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              That sign-in link could not be used. Sign in with your password instead.
            </p>
          ) : null}

          {message ? (
            <p className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">{message}</p>
          ) : null}

          {mode !== "recovery" ? (
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              minLength={8}
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={!ready}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? "Please wait..."
              : mode === "recovery"
                ? "Update password"
                : mode === "sign-in"
                  ? "Sign in"
                  : "Create account"}
          </Button>
        </form>
      </div>
    </main>
  );
}
