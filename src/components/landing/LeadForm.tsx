"use client";

import { useState } from "react";

export function LeadForm() {
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  if (sent) {
    return (
      <p className="rounded-lg border border-zinc-200 bg-indigo-50/60 px-6 py-5 text-sm text-zinc-700">
        Thanks{name ? `, ${name}` : ""} — the Automation Audit is on its way to{" "}
        <span className="font-medium text-zinc-900">{email}</span>.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) setSent(true);
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="First name"
        className="h-11 flex-1 rounded-lg border border-zinc-200 bg-white px-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-600 focus:outline-none"
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        required
        placeholder="Work email"
        className="h-11 flex-1 rounded-lg border border-zinc-200 bg-white px-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-600 focus:outline-none"
      />
      <button
        type="submit"
        className="h-11 rounded-lg bg-indigo-600 px-5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
      >
        Send me the audit
      </button>
    </form>
  );
}
