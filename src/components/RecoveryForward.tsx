"use client";

import { useEffect } from "react";

// Password-recovery links sent from the Supabase dashboard redirect to the
// project's Site URL — the marketing page — with the tokens in the URL hash.
// The marketing page can't finish a reset, so forward those visitors to /login
// (which handles the recovery hash) with the hash intact.
export function RecoveryForward() {
  useEffect(() => {
    const h = window.location.hash;
    const q = new URLSearchParams(window.location.search);
    if (
      h.includes("type=recovery") ||
      (h.includes("access_token=") && h.includes("refresh_token="))
    ) {
      window.location.replace(`/login${h}`);
    } else if (q.get("code")) {
      // PKCE-style recovery links carry ?code= — only auth links land on the
      // marketing page with one, so forward it for the exchange.
      window.location.replace(`/login${window.location.search}${h}`);
    }
  }, []);
  return null;
}
