"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

const USER_MSG = "How many invoices are still waiting on approval?";
const AGENT_MSG =
  "3 invoices are pending — two are waiting on legal review, one needs a PO match. I've nudged the approvers and flagged the mismatch for you.";

/**
 * Simulated live chat for the hero mockup: the user message types itself,
 * the agent "thinks" with a dot indicator, then replies and logs a status
 * line. Renders everything instantly when prefers-reduced-motion is set.
 */
export function ChatDemo() {
  const [typed, setTyped] = useState("");
  // 0 = typing user msg, 1 = agent thinking, 2 = agent replied, 3 = status shown
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTyped(USER_MSG);
      setPhase(3);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    let i = 0;
    const start = setTimeout(function tick() {
      i += 1;
      setTyped(USER_MSG.slice(0, i));
      if (i < USER_MSG.length) {
        timers.push(setTimeout(tick, 28));
      } else {
        timers.push(setTimeout(() => setPhase(1), 350));
        timers.push(setTimeout(() => setPhase(2), 1500));
        timers.push(setTimeout(() => setPhase(3), 2100));
      }
    }, 1400);
    timers.push(start);
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="mt-4 min-h-[160px] space-y-3 text-sm sm:min-h-[140px]">
      {typed && (
        <div className="ml-auto w-fit max-w-[80%] rounded-lg bg-indigo-600 px-3 py-2 text-white">
          {typed}
          {phase === 0 && <span className="stream-caret" />}
        </div>
      )}
      {phase === 1 && (
        <div className="w-fit rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5 text-zinc-400">
          <span className="typing-dot" /> <span className="typing-dot" />{" "}
          <span className="typing-dot" />
        </div>
      )}
      {phase >= 2 && (
        <div className="bubble-enter w-fit max-w-[85%] rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-zinc-700">
          {AGENT_MSG}
        </div>
      )}
      {phase >= 3 && (
        <div className="bubble-enter flex items-center gap-2 text-xs text-zinc-400">
          <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" />
          Reconciled 214 invoices today
        </div>
      )}
    </div>
  );
}
