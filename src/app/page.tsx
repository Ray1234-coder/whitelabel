import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Blocks,
  CalendarCheck,
  Check,
  CheckCircle2,
  Inbox,
  MessageSquare,
  Minus,
  ShieldCheck,
  UserCheck,
  Workflow,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { branding } from "@/config/branding";
import { CountUp } from "@/components/landing/CountUp";
import { LeadForm } from "@/components/landing/LeadForm";

const PAIN_FIX = [
  {
    pain: "Hours lost to copy-pasting between tools, chasing approvals, and re-typing the same updates",
    fix: "Agents handle the handoffs — data moves itself, approvals route themselves",
  },
  {
    pain: "Processes live in one person's head and stall when they're out",
    fix: "Every workflow is documented, automated, and running whether anyone's watching or not",
  },
  {
    pain: "Ops backlog grows faster than headcount",
    fix: "Agents scale instantly — your tenth workflow costs the same as your first",
  },
  {
    pain: "“Quick questions” interrupt your best people all day",
    fix: "Ask the agent instead — it knows the process, the status, and the history",
  },
];

const CAPABILITIES = [
  {
    icon: Workflow,
    title: "Automate up to 90% of routine work",
    body: "Intake, triage, data entry, reporting, follow-ups: handled end to end.",
  },
  {
    icon: Blocks,
    title: "Agents for every function",
    body: "Pre-built agents for finance, HR, sales ops, support, and IT, provisioned on day one.",
  },
  {
    icon: MessageSquare,
    title: "Chat with your operations",
    body: "Every agent is conversational: ask for status, change a process, or kick off a job in plain English.",
  },
  {
    icon: BadgeCheck,
    title: "Works with your stack",
    body: "Integrations mean agents act inside the tools you already pay for.",
  },
  {
    icon: UserCheck,
    title: "Humans stay in the loop",
    body: "Approvals, escalations, and audit trails are built into every workflow, not bolted on.",
  },
];

const STEPS = [
  {
    title: "Agents built around your processes",
    body: "Not off-the-shelf bots. We map your workflows and provision agents tuned to your tools, your rules, and your way of working.",
  },
  {
    title: "From daily tasks to the messy exceptions",
    body: "Agents run the routine automatically and flag anything unusual to a human — with full context, so decisions take seconds, not meetings.",
  },
  {
    title: "Manage everything from one dashboard",
    body: "See every agent, every workflow, every outcome in one place. Change anything by chatting: “route contracts over $50k to legal first” — done.",
  },
];

const LOGOS = [
  "Northbeam & Co",
  "Fairmont Labs",
  "Hollis Group",
  "Datewood",
  "Krane Systems",
  "Alder & Finch",
  "Mercury Ops",
  "Southlane",
];

function Wordmark() {
  return (
    <span className="text-lg font-semibold tracking-tight text-zinc-950">
      {branding.appName}
      <span className="text-indigo-600">.</span>
    </span>
  );
}

export default async function Home() {
  const { user } = await getSession();

  return (
    <div className="bg-white text-zinc-950">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-zinc-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-zinc-600 md:flex">
            <a href="#product" className="hover:text-zinc-950">Product</a>
            <a href="#how-it-works" className="hover:text-zinc-950">How it works</a>
            <a href="#agents" className="hover:text-zinc-950">Agents</a>
            <a href="#customers" className="hover:text-zinc-950">Customers</a>
            <a href="#security" className="hover:text-zinc-950">Security</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href={user ? "/dashboard" : "/login"}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
            >
              {user ? "Open dashboard" : "Log in"}
            </Link>
            <Link
              href="/login"
              className="hidden rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 sm:block"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden px-6 pb-24 pt-24 text-center md:pt-32">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-40 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-600/[0.04] blur-3xl"
          />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
            AI agents for every workflow
          </p>
          <h1 className="mx-auto mt-5 max-w-3xl text-5xl font-semibold tracking-tight md:text-6xl">
            Your work, running itself.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600">
            {branding.appName} provisions a team of AI agents for your company — trained on your
            processes, working around the clock, and one chat away when you need them.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/login"
              className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Get your agents
            </Link>
            <a
              href="#how-it-works"
              className="rounded-lg border border-zinc-200 px-6 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
            >
              See how it works
            </a>
          </div>

          {/* Product mockup */}
          <div className="relative mx-auto mt-16 max-w-4xl rounded-xl border border-zinc-200 bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-1.5 border-b border-zinc-100 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
              <span className="ml-3 text-xs text-zinc-400">{branding.appName} — Dashboard</span>
            </div>
            <div className="grid md:grid-cols-[180px_1fr]">
              <div className="hidden border-r border-zinc-100 p-4 md:block">
                <div className="text-xs font-medium text-zinc-900">Acme Production</div>
                <div className="mt-4 space-y-2 text-xs text-zinc-500">
                  <div className="rounded bg-indigo-50 px-2 py-1.5 font-medium text-indigo-700">Agents</div>
                  <div className="px-2 py-1.5">Members</div>
                  <div className="px-2 py-1.5">Settings</div>
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Invoice Agent</div>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    running
                  </span>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="ml-auto w-fit max-w-[80%] rounded-lg bg-indigo-600 px-3 py-2 text-white">
                    How many invoices are still waiting on approval?
                  </div>
                  <div className="w-fit max-w-[85%] rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-zinc-700">
                    3 invoices are pending — two are waiting on legal review, one needs a PO
                    match. I&apos;ve nudged the approvers and flagged the mismatch for you.
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" />
                    Reconciled 214 invoices today
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Problem → Solution */}
        <section id="product" className="border-t border-zinc-100 px-6 py-28">
          <div className="mx-auto max-w-6xl">
            <h2 className="max-w-xl text-3xl font-semibold tracking-tight md:text-4xl">
              The busywork is eating your week.
            </h2>
            <p className="mt-4 max-w-xl text-zinc-600">
              Every growing company runs on the same invisible grind — and it doesn&apos;t have to.
            </p>
            <div className="mt-12 grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 p-8">
                <p className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                  Without {branding.appName}
                </p>
                <ul className="mt-6 space-y-5">
                  {PAIN_FIX.map((row) => (
                    <li key={row.pain} className="flex gap-3 text-sm leading-relaxed text-zinc-600">
                      <Minus className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300" />
                      {row.pain}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-8">
                <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">
                  With {branding.appName}
                </p>
                <ul className="mt-6 space-y-5">
                  {PAIN_FIX.map((row) => (
                    <li key={row.fix} className="flex gap-3 text-sm leading-relaxed text-zinc-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                      {row.fix}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="border-t border-zinc-100 px-6 py-28">
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Numbers from teams already running on {branding.appName}
            </h2>
            <div className="mt-14 grid gap-12 sm:grid-cols-3">
              <div>
                <p className="text-6xl font-semibold tracking-tight text-indigo-600">
                  <CountUp value={31} suffix=" hrs" />
                </p>
                <p className="mt-3 text-sm text-zinc-600">saved per employee, every month</p>
              </div>
              <div>
                <p className="text-6xl font-semibold tracking-tight text-indigo-600">
                  <CountUp value={87} suffix="%" />
                </p>
                <p className="mt-3 text-sm text-zinc-600">of routine workflows fully automated</p>
              </div>
              <div>
                <p className="text-6xl font-semibold tracking-tight text-indigo-600">
                  <CountUp value={4} suffix=" min" />
                </p>
                <p className="mt-3 text-sm text-zinc-600">median time from request to done</p>
              </div>
            </div>
          </div>
        </section>

        {/* Security strip */}
        <section id="security" className="border-t border-zinc-100 px-6 py-20">
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              Enterprise-grade security, provable on request.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-600">
              Any platform touching your operations should prove it&apos;s safe — not just say so.{" "}
              {branding.appName} does.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {["SOC 2 Type II", "GDPR", "ISO 27001", "SSO / SAML", "Data residency options"].map(
                (badge) => (
                  <span
                    key={badge}
                    className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-4 py-1.5 text-xs font-medium text-zinc-700"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />
                    {badge}
                  </span>
                )
              )}
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section id="agents" className="border-t border-zinc-100 px-6 py-28">
          <div className="mx-auto max-w-6xl">
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">
              One dashboard. A whole workforce of agents.
            </h2>
            <p className="mt-4 max-w-2xl text-zinc-600">
              {branding.appName} makes every department faster — without changing the tools you
              already use.
            </p>
            <div className="mt-12 divide-y divide-zinc-100 border-y border-zinc-100">
              {CAPABILITIES.map((cap) => {
                const Icon = cap.icon;
                return (
                  <div key={cap.title} className="flex gap-5 py-7">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                      <Icon className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{cap.title}</h3>
                      <p className="mt-1 text-sm text-zinc-600">{cap.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Manifesto */}
        <section className="border-t border-zinc-100 px-6 py-28">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-semibold leading-snug tracking-tight md:text-4xl">
              Good work shouldn&apos;t feel like fighting your tools.{" "}
              <span className="text-indigo-600">That&apos;s why there&apos;s {branding.appName}.</span>
            </h2>
            <p className="mt-6 leading-relaxed text-zinc-600">
              Your team didn&apos;t join to chase spreadsheets and forward emails.{" "}
              {branding.appName} takes the repetitive layer off their plate so the hours they give
              you go to the work only people can do — the thinking, the building, the customers.
            </p>
            <div className="mt-12 flex items-center justify-center gap-10 text-zinc-300">
              <Inbox className="h-8 w-8" />
              <CalendarCheck className="h-8 w-8" />
              <MessageSquare className="h-8 w-8 text-indigo-600" />
              <CheckCircle2 className="h-8 w-8" />
            </div>
          </div>
        </section>

        {/* Logo wall */}
        <section id="customers" className="border-t border-zinc-100 px-6 py-20">
          <div className="mx-auto max-w-6xl text-center">
            <p className="text-sm font-medium text-zinc-400">Teams that run on {branding.appName}</p>
            <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
              {LOGOS.map((logo) => (
                <span key={logo} className="text-sm font-semibold tracking-wide text-zinc-300">
                  {logo}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonial */}
        <section className="border-t border-zinc-100 px-6 py-28">
          <div className="mx-auto max-w-3xl">
            <span className="text-6xl font-serif leading-none text-indigo-600">&ldquo;</span>
            <blockquote className="mt-2 text-2xl font-medium leading-relaxed tracking-tight">
              During our year-end close, {branding.appName}&apos;s agents processed over 2,300
              invoices and reconciliations on their own. My team reviewed exceptions instead of
              doing data entry — we closed the books six days early.
            </blockquote>
            <p className="mt-6 text-sm text-zinc-500">— VP of Operations, early access customer</p>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t border-zinc-100 px-6 py-28">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">How it works</h2>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <div key={step.title} className="rounded-xl border border-zinc-200 p-8">
                  <span className="text-sm font-semibold text-indigo-600">0{i + 1}</span>
                  <h3 className="mt-3 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-zinc-100 px-6 py-28">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Curious what your team could hand off first?
            </h2>
            <p className="mt-4 text-zinc-600">
              Get our free worksheet —{" "}
              <span className="font-medium text-zinc-900">
                The Automation Audit: 20 Questions to Find Your First AI Agent
              </span>{" "}
              — and see where the hours are hiding.
            </p>
            <div className="mt-8">
              <LeadForm />
            </div>
            <p className="mt-5 text-sm text-zinc-600">
              Ready now?{" "}
              <Link href="/login" className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-700">
                Get your agents <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-100 px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-4">
          <div>
            <Wordmark />
            <p className="mt-3 text-sm leading-relaxed text-zinc-500">
              AI agents that run your business workflows — provisioned for you, managed from one
              dashboard.
            </p>
            <p className="mt-3 text-sm text-zinc-500">hello@workify.ai</p>
          </div>
          <div>
            <p className="text-sm font-semibold">Product</p>
            <ul className="mt-3 space-y-2 text-sm text-zinc-500">
              <li><a href="#product" className="hover:text-zinc-900">Product</a></li>
              <li><a href="#how-it-works" className="hover:text-zinc-900">How it works</a></li>
              <li><a href="#agents" className="hover:text-zinc-900">Agents</a></li>
              <li><a href="#security" className="hover:text-zinc-900">Security</a></li>
              <li><Link href="/login" className="hover:text-zinc-900">Log in</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold">Company</p>
            <ul className="mt-3 space-y-2 text-sm text-zinc-500">
              <li>About</li>
              <li>Customers</li>
              <li>Careers</li>
              <li>Contact</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold">Legal</p>
            <ul className="mt-3 space-y-2 text-sm text-zinc-500">
              <li>Terms of Service</li>
              <li>Privacy Policy</li>
              <li>DPA</li>
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-6xl border-t border-zinc-100 pt-6 text-sm text-zinc-400">
          © 2026 {branding.appName}. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
