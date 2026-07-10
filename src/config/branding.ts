export const branding = {
  appName: process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Workify",
  logoUrl: process.env.NEXT_PUBLIC_LOGO_URL?.trim() || "",
};

// Support contact shown in the Members "Get help" dialog. Phone is stored
// digits-only and formatted for display; email is the support account that gets
// added when a workspace grants access (keep in sync with SUPPORT_EMAIL server-side).
const rawPhone = (process.env.NEXT_PUBLIC_SUPPORT_PHONE || "5167361166").replace(/\D/g, "");
export const support = {
  phoneDigits: rawPhone,
  phoneDisplay:
    rawPhone.length === 10
      ? `(${rawPhone.slice(0, 3)}) ${rawPhone.slice(3, 6)}-${rawPhone.slice(6)}`
      : rawPhone,
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "michael@home-energysolutions.com",
};
