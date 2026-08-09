/**
 * Adapt the raw Modelltest manifest + module JSON into the generic
 * `ExamSession` shape consumed by the player UI.
 *
 * Verbatim port of `deutschfit-mobile/src/core/exam/loadModel.ts`. The
 * shapes below are the contract the backend `lesen-start` / `lesen-practice-get`
 * (and future `hoeren-*`) payloads must satisfy.
 */

import type {
  AnswerFormat,
  ExamItem,
  ExamPart,
  ExamSession,
  ExamOption,
  ModuleCode,
} from "./types";

// Input shapes are read as-is by `buildSession`. Declaring them
// `readonly` across the board means both in-repo fixtures (mutable
// literals, which TS widens freely into `readonly`) *and* live-mode
// payloads from the edge functions (already readonly) flow through the
// same loader without a `(payload as any)` escape hatch.
interface RawOption {
  readonly key: string;
  readonly text: string;
}

interface RawQuestion {
  /**
   * Server-side UUID (`qb_questions.id`) — present when the payload
   * comes from the `lesen-start` / `hoeren-start` edge functions (F5).
   * Optional because the in-repo placeholder fixture doesn't carry one;
   * `adaptQuestion` falls back to the synthetic `${partId}-q${number}`
   * shape so offline flows keep working.
   *
   * Answer maps sent to the server must key by this UUID — the synthetic
   * fallback is client-only.
   */
  readonly id?: string;
  readonly item_number: number;
  readonly stem_de: string | null;
  readonly needs_content?: boolean;
  // The server returns the raw DB enum as a string; the in-repo placeholder
  // fixtures narrow it to the typed `AnswerFormat` union. Declare the
  // input shape as the wider `string` + validate at adaptor time so both
  // sources flow through without a cast.
  readonly answer_format: AnswerFormat | string;
  readonly options: readonly RawOption[];
  readonly correct_answer: string;
  readonly reading_text_slug?: string | null;
  readonly audio_track_slug?: string | null;
}

const KNOWN_ANSWER_FORMATS = new Set<AnswerFormat>([
  "TRUE_FALSE",
  "YES_NO",
  "MC_SINGLE_3",
  "MC_SINGLE_4",
  "MATCH_TO_ITEM",
  "CLOZE_RADIO",
  "CLOZE_DRAG",
]);

function narrowAnswerFormat(raw: string): AnswerFormat {
  return KNOWN_ANSWER_FORMATS.has(raw as AnswerFormat)
    ? (raw as AnswerFormat)
    : // Unknown answer_format on the wire — keep playing single-choice so
      // the screen renders. The server-side grading contract still wins.
      "MC_SINGLE_4";
}

interface RawStimulus {
  readonly slug: string;
  readonly label: string;
  /** Hören tracks may carry these. */
  readonly audio_missing?: boolean;
  readonly transcript_md?: string | null;
}

interface RawPart {
  readonly teil_number: number;
  readonly teil_label: string;
  readonly part_kind: string;
  readonly duration_minutes: number;
  readonly instructions_de: string;
  readonly reading_texts?: readonly RawStimulus[];
  readonly audio_tracks?: readonly RawStimulus[];
  readonly questions: readonly RawQuestion[];
}

interface RawModule {
  readonly module_code: ModuleCode;
  readonly source_slug: string;
  readonly parts: readonly RawPart[];
}

interface RawManifestModule {
  readonly code: "LESEN" | "HOEREN" | "SCHREIBEN" | "SPRECHEN" | "SPRACHBAUSTEINE";
  readonly duration_minutes: number;
  readonly item_count: number;
  readonly instructions_de: string;
}

interface RawManifest {
  readonly modelltest: {
    readonly slug: string;
    readonly title: string;
    readonly short_label: string;
  };
  readonly modules: readonly RawManifestModule[];
}

export interface AudioTrackInfo {
  readonly slug: string;
  readonly label: string;
  readonly audioMissing: boolean;
  readonly transcript: string | null;
}

function adaptOptions(opts: readonly RawOption[]): ExamOption[] {
  return opts.map((o) => ({ key: o.key, text: o.text }));
}

function adaptQuestion(
  q: RawQuestion,
  partId: string,
  fallbackStimulusSlug: string | null
): ExamItem {
  const stimulusSlug = q.reading_text_slug ?? q.audio_track_slug ?? fallbackStimulusSlug;
  // Prefer the server UUID when present — it's the key the backend
  // uses to reconcile answers in `hoeren-submit` / `lesen-submit`.
  // Fall back to the legacy synthetic id for in-repo placeholder
  // content so the offline fixture flows keep working.
  const id = q.id ?? `${partId}-q${q.item_number}`;
  return {
    id,
    number: q.item_number,
    stem: q.stem_de,
    answerFormat: narrowAnswerFormat(q.answer_format),
    options: adaptOptions(q.options),
    correctKey: q.correct_answer,
    stimulusSlug,
  };
}

function adaptPart(p: RawPart, examSlug: string): ExamPart {
  const id = `${examSlug}-t${p.teil_number}`;
  // Hören questions don't carry an explicit audio_track_slug — they implicitly
  // belong to the part's audio track. Attach the first one so the player can
  // surface the audio control alongside every item in that Teil.
  const fallback = p.audio_tracks?.[0]?.slug ?? null;
  return {
    id,
    teilNumber: p.teil_number,
    label: p.teil_label,
    partKind: p.part_kind,
    durationMinutes: p.duration_minutes,
    instructions: p.instructions_de,
    items: p.questions.map((q) => adaptQuestion(q, id, fallback)),
  };
}

export interface LoadOptions {
  readonly manifest: RawManifest;
  readonly module: RawModule;
}

const MODULE_TITLES: Record<ModuleCode, string> = {
  LESEN: "Lesen",
  HOEREN: "Hören",
  SPRACHBAUSTEINE: "Sprachbausteine",
};

export function buildSession(opts: LoadOptions): ExamSession {
  const { manifest, module } = opts;
  const moduleManifest = manifest.modules.find((m) => m.code === module.module_code);
  const totalDurationMinutes = moduleManifest?.duration_minutes ?? sumPartDurations(module);

  return {
    id: `${manifest.modelltest.slug}-${module.module_code.toLowerCase()}`,
    examSlug: manifest.modelltest.slug,
    moduleCode: module.module_code,
    title: `${manifest.modelltest.short_label} · ${MODULE_TITLES[module.module_code]}`,
    totalDurationMinutes,
    parts: module.parts.map((p) => adaptPart(p, manifest.modelltest.slug)),
  };
}

function sumPartDurations(module: RawModule): number {
  let n = 0;
  for (const p of module.parts) n += p.duration_minutes;
  return n;
}

/**
 * Pull audio-track metadata indexed by stimulus slug. Hören screens render
 * one stub player per track; missing tracks render the read-only transcript
 * placeholder defined in the player component.
 */
export function indexAudioTracks(module: RawModule): Readonly<Record<string, AudioTrackInfo>> {
  const out: Record<string, AudioTrackInfo> = {};
  for (const p of module.parts) {
    for (const t of p.audio_tracks ?? []) {
      out[t.slug] = {
        slug: t.slug,
        label: t.label,
        audioMissing: t.audio_missing ?? false,
        transcript: t.transcript_md ?? null,
      };
    }
  }
  return out;
}

/**
 * Zero-item placeholder session. Returned by the module hooks in live
 * mode while the server fetch is in flight (or errored) so the player's
 * hook order stays stable without dragging a legacy-fixture dependency
 * into the live-mode path. The screen branches on `status` to decide
 * whether to render a loading / error view instead of the player.
 */
export function createEmptyExamSession(moduleCode: ExamSession["moduleCode"]): ExamSession {
  return {
    id: `empty-${moduleCode.toLowerCase()}`,
    examSlug: "",
    moduleCode,
    title: "",
    totalDurationMinutes: 0,
    parts: [],
  };
}
