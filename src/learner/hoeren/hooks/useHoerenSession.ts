"use client";

/**
 * `useHoerenSession` — Hören session hydration (S5 · Task 5.4). Web port of
 * `deutschfit-mobile/src/features/hoeren/hooks/useHoerenSession.ts`, live +
 * practice branches only — mobile's fixture-mode branch (in-repo
 * placeholder Modelltest resolved from `useExamContext()`'s track) is
 * retired here: the web app has no fixture path, same precedent as
 * `useLesenSession.ts`'s header comment.
 *
 * Three dispatch modes:
 *   - `attemptId` → `fetchHoerenSession({ attemptId })` (resume via
 *     `hoeren-session-get`).
 *   - `examSlug` → `fetchHoerenSession({ examSlug })` (create/reuse via
 *     `hoeren-start`).
 *   - neither → practice (the Apprendre mount). This branch self-hydrates
 *     the exam-context store and gates the fetch on `isLoaded` — same S4
 *     idiom as `usePracticeSession.ts`'s "Hydration guard (fix round 1)":
 *     this route can be deep-linked/hard-refreshed straight onto, and
 *     nothing upstream guarantees `hydrateExamContext()` already ran, so
 *     fetching against the store's un-hydrated default board/level would
 *     silently serve the wrong track (the #473 family of bugs). Once
 *     loaded, `toPracticeLevel(level)` resolves the practice level: `null`
 *     (unsupported CEFR level) flips `status` to `"unsupported"` WITHOUT
 *     any request (#473); otherwise
 *     `fetchHoerenPracticeSession(practiceLevel, slug)` fires — `slug`
 *     threads the practice-set picker's selection (P14, web delta; mobile
 *     takes level only).
 *
 * `buildLoaderModule` adapts the wire `HoerenModule` into the shared S4
 * loader's expected shape (`reading_texts: []` — Hören has none) so
 * `buildSession` / `indexAudioTracks`, already used by Lesen, can be reused
 * verbatim without an unsafe cast (the adapted literal already satisfies
 * `RawModule`).
 *
 * `audioUrlBySlug` is NOT sourced from the shared loader — its adapted
 * shape has no URL field — so signed URLs are threaded straight from the
 * server payload here, keyed by track slug. A `null` entry is KEPT (not
 * skipped): it is the "track exists, signing failed" signal the player
 * uses to render a fallback (mobile 229–239).
 *
 * `isEmpty` stays a constant `false` — a fixture-mode relic (mobile's
 * server-mode branch was always `isEmpty: false` too). The empty gate
 * belongs to the SCREEN's `parts.length === 0` check, not this hook (P4).
 *
 * `reload()` re-runs the active fetch — the P3 signed-URL recovery path
 * (re-hitting `hoeren-session-get` / `hoeren-practice-get` re-mints URLs).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchHoerenPracticeSession,
  fetchHoerenSession,
  type HoerenSessionPayload,
} from "@/learner/core/api/examApi";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import {
  buildSession,
  createEmptyExamSession,
  indexAudioTracks,
  type AudioTrackInfo,
} from "@/learner/core/exam/engine/loadModel";
import { toPracticeLevel } from "@/learner/core/exam/engine/practiceLevel";
import type { ExamSession } from "@/learner/core/exam/engine/types";
import { useExamPlayer, type ExamPlayerState } from "@/learner/core/exam/engine/useExamPlayer";

import { computeHoerenLevelLabels } from "../hoerenUtils";

export type UseHoerenSessionStatus = "idle" | "loading" | "ready" | "unsupported" | "error";

export interface UseHoerenSessionArgs {
  readonly attemptId?: string;
  readonly examSlug?: string;
  /** Practice-set slug from the picker (P14, web delta — mobile has none). */
  readonly slug?: string;
}

export interface UseHoerenSessionResult {
  readonly player: ExamPlayerState;
  readonly audioTracks: Readonly<Record<string, AudioTrackInfo>>;
  /**
   * Signed audio URL per track slug, threaded straight from the server
   * payload (the shared loader adapter drops `audio_url`). `{}` before the
   * fetch resolves. A `null` value is kept — see the module doc comment.
   */
  readonly audioUrlBySlug: Readonly<Record<string, string | null>>;
  /** Re-run the active fetch — the signed-URL recovery path (P3). */
  readonly reload: () => void;
  /**
   * Constant `false` on web — a fixture-mode relic (P4/P15). The screen's
   * `parts.length === 0` check is the only empty-state trigger.
   */
  readonly isEmpty: boolean;
  /** Slug of the loaded exam/practice set. `""` before the fetch resolves. */
  readonly slug: string;
  readonly status: UseHoerenSessionStatus;
  readonly error: Error | null;
  /**
   * Server-side attempt id, when one exists. Prefers the payload's value —
   * practice's genuine `null` must not be shadowed by a stray
   * `args.attemptId`.
   */
  readonly attemptId: string | null;
  /** CEFR level from the active exam context, uppercased (e.g. `"B1"`). */
  readonly level: string;
  /** Formatted results label derived from the active exam context. */
  readonly examLabel: string;
}

type HoerenModuleShape = HoerenSessionPayload["module"];
type LoaderModule = Parameters<typeof buildSession>[0]["module"];

/**
 * `loadModel.buildSession` expects `audio_tracks` + `reading_texts` at the
 * part level with a `slug | label | audio_missing? | transcript_md?` shape.
 * The `HoerenSessionPayload` envelope already matches for `audio_tracks`;
 * `reading_texts` are empty on Hören.
 */
function buildLoaderModule(module: HoerenModuleShape): LoaderModule {
  return {
    module_code: module.module_code,
    source_slug: module.source_slug,
    parts: module.parts.map((p) => ({
      teil_number: p.teil_number,
      teil_label: p.teil_label,
      part_kind: p.part_kind,
      duration_minutes: p.duration_minutes,
      instructions_de: p.instructions_de,
      reading_texts: [],
      audio_tracks: p.audio_tracks.map((t) => ({
        slug: t.slug,
        label: t.label,
        ...(t.audio_missing !== undefined ? { audio_missing: t.audio_missing } : {}),
        ...(t.transcript_md !== undefined ? { transcript_md: t.transcript_md } : {}),
      })),
      questions: p.questions.map((q) => ({
        id: q.id,
        item_number: q.item_number,
        stem_de: q.stem_de,
        answer_format: q.answer_format,
        options: q.options.map((o) => ({ key: o.key, text: o.text })),
        correct_answer: q.correct_answer,
        audio_track_slug: q.audio_track_slug,
      })),
    })),
  };
}

export function useHoerenSession(args: UseHoerenSessionArgs): UseHoerenSessionResult {
  const level = useExamContextStore((s) => s.level);
  const isExamContextLoaded = useExamContextStore((s) => s.isLoaded);

  const [payload, setPayload] = useState<HoerenSessionPayload | null>(null);
  const [status, setStatus] = useState<UseHoerenSessionStatus>("loading");
  const [error, setError] = useState<Error | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // This route (the Apprendre practice mount, and any hard-refreshed/
  // deep-linked live route) has no ancestor guaranteed to hydrate the
  // exam-context store — trigger it here, same idiom as
  // `usePracticeSession.ts`. `hydrateExamContext()` is idempotent/cheap to
  // call again if some other screen already did.
  useEffect(() => {
    void hydrateExamContext();
  }, []);

  useEffect(() => {
    let fetchPayload: () => Promise<HoerenSessionPayload>;

    if (args.attemptId) {
      const attemptId = args.attemptId;
      fetchPayload = () => fetchHoerenSession({ attemptId });
    } else if (args.examSlug) {
      const examSlug = args.examSlug;
      fetchPayload = () => fetchHoerenSession({ examSlug });
    } else {
      // Practice mode — do not fetch against the store's not-yet-hydrated
      // default (board, level) on a deep-link (#473 family).
      if (!isExamContextLoaded) {
        setStatus("loading");
        setError(null);
        return;
      }
      const practiceLevel = toPracticeLevel(level);
      if (practiceLevel === null) {
        setPayload(null);
        setStatus("unsupported");
        setError(null);
        return;
      }
      const slug = args.slug;
      fetchPayload = () => fetchHoerenPracticeSession(practiceLevel, slug);
    }

    let cancelled = false;
    setStatus("loading");
    setError(null);

    void (async () => {
      try {
        const result = await fetchPayload();
        if (cancelled) return;
        setPayload(result);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setPayload(null);
        setStatus("error");
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [args.attemptId, args.examSlug, args.slug, isExamContextLoaded, level, reloadNonce]);

  const loaderModule = useMemo(
    () => (payload ? buildLoaderModule(payload.module) : null),
    [payload]
  );

  const session: ExamSession = useMemo(() => {
    if (!payload || !loaderModule) return createEmptyExamSession("HOEREN");
    return buildSession({ manifest: payload.manifest, module: loaderModule });
  }, [payload, loaderModule]);

  const audioTracks: Readonly<Record<string, AudioTrackInfo>> = useMemo(() => {
    if (!loaderModule) return {};
    return indexAudioTracks(loaderModule);
  }, [loaderModule]);

  // The shared loader adapter drops `audio_url`, so thread signed URLs
  // straight from the server payload, keyed by track slug. `null` entries
  // are kept — see the module doc comment.
  const audioUrlBySlug: Readonly<Record<string, string | null>> = useMemo(() => {
    if (!payload) return {};
    const map: Record<string, string | null> = {};
    for (const part of payload.module.parts) {
      for (const track of part.audio_tracks) {
        map[track.slug] = track.audio_url;
      }
    }
    return map;
  }, [payload]);

  const reload = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  const player = useExamPlayer(session);

  const { displayLevel, examLabel } = useMemo(() => computeHoerenLevelLabels(level), [level]);

  return {
    player,
    audioTracks,
    audioUrlBySlug,
    reload,
    isEmpty: false,
    slug: payload?.examSlug ?? args.examSlug ?? "",
    status,
    error,
    // Prefer the payload's value when present — practice returns a genuine
    // `null` that must not be shadowed by a stray `args.attemptId`.
    attemptId: payload ? payload.attemptId : (args.attemptId ?? null),
    level: displayLevel,
    examLabel,
  };
}
