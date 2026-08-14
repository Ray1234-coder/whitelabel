"use client";

import { useEffect } from "react";

// Password-recovery links sent from the Supabase dashboard redirect to the
// project's Site URL — the marketing page — with the tokens in the URL hash.
// The marketing page can't finish a reset, so forward those visitors to /login
// (which handles the recovery hash) with the hash intact.
export function RecoveryForward() {
  useEffect(() => {
    const h = window.location.hash;
    if (
      h.includes("type=recovery") ||
      (h.includes("access_token=") && h.includes("refresh_token="))
    ) {
      window.location.replace(`/login${h}`);
    }
  }, []);
  return null;
}
