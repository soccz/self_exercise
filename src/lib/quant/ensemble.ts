import { analyzeByAnalyst } from "./analyst";
import { analyzeByPhysio } from "./physio";
import { analyzeByPsych } from "./psych";
import type { CouncilAdvice, CouncilInput, CouncilResult } from "./types";

function clampPriority(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeAdvice(advice: CouncilAdvice): CouncilAdvice {
  return {
    ...advice,
    priority: clampPriority(advice.priority),
    confidence: Math.max(0, Math.min(1, advice.confidence)),
  };
}

function uniqByHeadline(items: CouncilAdvice[]): CouncilAdvice[] {
  const seen = new Set<string>();
  const out: CouncilAdvice[] = [];
  for (const item of items) {
    const key = `${item.agent}:${item.headline}:${item.action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function compareAdvice(a: CouncilAdvice, b: CouncilAdvice): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.confidence !== b.confidence) return b.confidence - a.confidence;
  return a.agent.localeCompare(b.agent);
}

export function consultCouncil(input: CouncilInput): CouncilResult {
  const all = uniqByHeadline([
    ...analyzeByAnalyst(input),
    ...analyzeByPhysio(input),
    ...analyzeByPsych(input),
  ].map(normalizeAdvice));

  const sorted = [...all].sort(compareAdvice);

  // Physio veto: any high-risk physio warning becomes first priority.
  const physioVeto = sorted.find((a) => a.agent === "physio" && a.risk === "high");
  let top = sorted.slice(0, 3);
  if (physioVeto) {
    top = [physioVeto, ...sorted.filter((a) => a !== physioVeto)].slice(0, 3);
  }

  return {
    top,
    primary: top[0] ?? null,
  };
}
