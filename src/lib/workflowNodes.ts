import { isSplitNode, type WorkflowNode, type WorkflowStep } from "@/lib/types";

// Sanitize workflow nodes coming from the browser (create/edit). Preserves the
// split structure — earlier versions stripped everything to {title,instructions}
// which would silently destroy branches. Rules:
// - plain steps need non-empty instructions
// - a split keeps only branches that still have at least one real step
// - a split left with one branch collapses inline; with none, it's dropped
// - hard cap on total steps to keep runs bounded
export const WORKFLOW_MAX_STEPS = 20;
export const WORKFLOW_MAX_BRANCHES = 3;

type RawStep = { title?: string; instructions?: string };
type RawNode = RawStep & { branches?: { title?: string; steps?: RawStep[] }[] };

function cleanStep(s: RawStep, fallback: string): WorkflowStep | null {
  const instructions = (s.instructions || "").trim();
  if (!instructions) return null;
  return { title: (s.title || fallback).trim() || fallback, instructions };
}

export function normalizeNodes(input: unknown): WorkflowNode[] {
  if (!Array.isArray(input)) return [];
  const out: WorkflowNode[] = [];
  let count = 0;
  for (const raw of input as RawNode[]) {
    if (count >= WORKFLOW_MAX_STEPS) break;
    if (raw && Array.isArray(raw.branches)) {
      const branches = raw.branches
        .slice(0, WORKFLOW_MAX_BRANCHES)
        .map((b, bi) => ({
          title: (b.title || "").trim() || `Branch ${bi + 1}`,
          steps: (Array.isArray(b.steps) ? b.steps : [])
            .map((s, si) => cleanStep(s, `Step ${si + 1}`))
            .filter((s): s is WorkflowStep => s !== null),
        }))
        .filter((b) => b.steps.length > 0);
      if (branches.length === 0) continue;
      if (branches.length === 1) {
        // A one-lane split is just a sequence.
        for (const s of branches[0].steps) {
          if (count >= WORKFLOW_MAX_STEPS) break;
          out.push(s);
          count++;
        }
        continue;
      }
      const stepTotal = branches.reduce((n, b) => n + b.steps.length, 0);
      out.push({ title: (raw.title || "").trim() || "Do these at the same time", branches });
      count += stepTotal;
    } else {
      const s = cleanStep(raw, `Step ${out.length + 1}`);
      if (s) {
        out.push(s);
        count++;
      }
    }
  }
  return out;
}

// Plain-text outline for the legacy `instructions` column (list views, agent context).
export function summarizeNodes(nodes: WorkflowNode[]): string {
  return nodes
    .map((n, i) => {
      if (isSplitNode(n)) {
        const lanes = n.branches.map((b) => b.title || "branch").join(" + ");
        return `${i + 1}. In parallel: ${lanes}`;
      }
      return `${i + 1}. ${n.title}`;
    })
    .join("\n");
}
