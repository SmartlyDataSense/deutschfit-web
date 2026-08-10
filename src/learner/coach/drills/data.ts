/**
 * Drill-chain factory (S9 · Task 9.5).
 *
 * Ports `deutschfit-mobile/src/features/coach/drills/data.ts` (mobile
 * HEAD — Plan F · F12) verbatim: same deterministic-shuffle hash/LCG
 * constants, same `rotatePool` offsetting, same matched-then-fallback
 * pool selection. The mobile client is a pure consumer of the
 * backend-supplied `DrillTemplate[]` (`coach-weekly-plan` edge
 * function) — it never synthesises drills locally, and neither does
 * this port.
 *
 * Deviation from mobile (per the task-9.5-brief's declared `Produces`
 * shape — see `./types.ts`'s docstring): `templateToDrill` builds a
 * `ConnectorDrill` with no `kind` field, since the web `ConnectorDrill`
 * type carries no discriminant. `DrillTemplate` itself is unchanged and
 * imported from `../planApi` (S9 · Task 9.1) rather than mobile's
 * `@core/api/coach` — same wire shape, different module path.
 */

import type { DrillTemplate } from "../planApi";

import type { ConnectorDrill, DrillChain } from "./types";

export type { DrillTemplate };

function deterministicShuffle<T>(arr: readonly T[], seed: string): readonly T[] {
  // Deterministic Fisher–Yates so tests don't flake and the same
  // observation always produces the same option order. Hash/LCG
  // constants copied verbatim from mobile's `data.ts`.
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const code = seed.charCodeAt(i);
    hash = (hash * 31 + code) >>> 0;
  }
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    const j = hash % (i + 1);
    const tmp = out[i];
    const other = out[j];
    if (tmp !== undefined && other !== undefined) {
      out[i] = other;
      out[j] = tmp;
    }
  }
  return out;
}

function templateToDrill(tpl: DrillTemplate, seed: string): ConnectorDrill {
  const options = deterministicShuffle([tpl.answer, ...tpl.distractors], `${seed}:${tpl.id}`);
  return {
    id: tpl.id,
    before: tpl.before,
    after: tpl.after,
    options,
    answer: tpl.answer,
    explanation: tpl.explanation,
  };
}

/**
 * Build a connector drill chain from a backend-supplied template list.
 *
 * Picks up to `size` templates (default 4) whose `answer` matches the
 * observation's flagged connector set; falls back to the full pool when
 * the intersection is empty so a non-empty `templates` array always
 * yields a non-empty chain. When `templates` itself is empty the chain
 * is empty too — the caller (drill screen) renders an empty-state
 * fallback.
 *
 * `nonce` is mixed into the seed so each "Démarrer le drill" tap
 * produces a different walk through the pool. Within a single attempt
 * the caller MUST keep the same nonce (so re-renders / resume yield the
 * same chain); only when the user starts a brand-new chain should a
 * fresh nonce be minted.
 */
export function buildConnectorDrillChain(params: {
  readonly observationId: string;
  readonly templates: readonly DrillTemplate[];
  readonly flaggedConnectors?: readonly string[];
  readonly size?: number;
  readonly nonce: string;
}): DrillChain {
  const targetSize = params.size ?? 4;
  const flagged = new Set((params.flaggedConnectors ?? []).map((c) => c.toLowerCase()));
  const seed = `${params.observationId}:${[...flagged].sort().join(",")}:${params.nonce}`;

  const matched =
    flagged.size > 0 ? params.templates.filter((tpl) => flagged.has(tpl.answer.toLowerCase())) : [];
  const matchedPool = matched.length > 0 ? matched : params.templates;
  // Rotate the pool start position by a hash of the seed so different
  // nonces walk into the pool from different offsets even when the pool
  // is smaller than `targetSize` (existing dedupe loop still holds).
  const pool = matchedPool.length > 1 ? rotatePool(matchedPool, hashSeed(seed)) : matchedPool;

  const picked: DrillTemplate[] = [];
  let cursor = 0;
  while (picked.length < targetSize && pool.length > 0 && cursor < pool.length * 2) {
    const tpl = pool[cursor % pool.length];
    if (tpl !== undefined && !picked.some((p) => p.id === tpl.id)) {
      picked.push(tpl);
    }
    cursor += 1;
  }

  return {
    id: `chain-${params.observationId}`,
    observationId: params.observationId,
    drills: picked.map((tpl) => templateToDrill(tpl, seed)),
  };
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function rotatePool<T>(arr: readonly T[], hash: number): readonly T[] {
  const offset = hash % arr.length;
  if (offset === 0) return arr;
  return [...arr.slice(offset), ...arr.slice(0, offset)];
}
