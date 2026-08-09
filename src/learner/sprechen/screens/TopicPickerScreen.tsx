"use client";

/**
 * `TopicPickerScreen` — Sprechen monologue topic picker (S7 Task 7.6).
 *
 * Web port of `deutschfit-mobile/src/features/sprechen/screens/
 * TopicPickerScreen.tsx` (610L) + `hooks/useTopicCatalog.ts` (188L) +
 * `components/LevelChip.tsx` (194L) + `components/SubgenreSelect.tsx`
 * (177L) — read all four end-to-end before touching this file. The
 * catalog-loading hook and the two selector components are folded into
 * this single file (no separate `useTopicCatalog`/`LevelChip`/
 * `SubgenreSelect` module — the S7 file map lists only this screen, the
 * handoff store, and the route page for Task 7.6) but their logic is
 * ported verbatim from the mobile sources cited above.
 *
 * Exam-context hydration gate (S4/S6 idiom, established by
 * `HoerenIntroScreen`/`PracticeHubScreen`/`PromptListScreen`): this route
 * is deep-linkable and its ancestor layout chain never calls
 * `hydrateExamContext()`, so the screen self-hydrates on mount. The
 * catalog fetch is gated on `isExamContextLoaded` via the ported hook's
 * own `enabled` flag — it never fires against the un-hydrated default
 * (board, level), which would warm the wrong cache key. Because the
 * gate keeps the fetch a no-op through the *initial* mount (including
 * React 18 StrictMode's synchronous double-invoke of that first effect
 * run), and the real fetch only fires on the later `isLoaded: true`
 * transition (a normal, non-double-invoked re-render), the fetch fires
 * exactly once — see `learner-sprechen-topic-picker.test.tsx`'s
 * `guard-removal-verified` test, which wraps the render in
 * `<StrictMode>` to prove it.
 *
 * Web delta (Constraint 8): mobile's `LevelChip`/`SubgenreSelect` are RN
 * `Modal` bottom-sheets. Here they become accessible popover-listboxes —
 * a trigger `<button aria-haspopup="listbox" aria-expanded>` opening a
 * `role="listbox"` panel of `role="option"` buttons, dismissed by
 * backdrop click, Escape, or a successful pick — same option sets and
 * labels as mobile (`ACTIVE_LEVELS`/`ALL_LEVELS`/`DISABLED_OPACITY`,
 * `SUBGENRES`), not a new primitive library. Constraint 8 also requires
 * focus management on any overlay (`SchreibenEditorScreen.tsx:130-140`
 * precedent — `tabIndex={-1}` container + a `useEffect` keyed on the open
 * flag): both popover panels below take programmatic focus on open, run a
 * roving `aria-activedescendant` highlight driven by ArrowUp/ArrowDown/
 * Home/End, pick the highlighted option on Enter/Space, and return focus
 * to the trigger button on every close path (pick, Escape, backdrop).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import {
  AppButton,
  AppText,
  Card,
  Chip,
  EmptyState,
  Input,
  Skeleton,
} from "@/learner/ui/primitives";

import {
  fetchTopics,
  sortTopicsByCert,
  type SprechenCertCode,
  type SprechenPickerLevel,
  type SprechenSubgenre,
  type TopicCard,
} from "@/learner/core/api/examApi";
import { trackEvent } from "@/learner/core/analytics/posthog";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import { CERT_CODES_BY_BOARD, type ExamBoard } from "@/learner/core/exam/examTypes";

import { useTopicHandoff } from "../topicHandoffStore";

/** Debounce window for the search box — mobile `SEARCH_DEBOUNCE_MS`. */
const SEARCH_DEBOUNCE_MS = 250;

// ---------------------------------------------------------------------------
// Subgenres offered — only the ones with seeded `qb_sl_topics` content.
// `bildbeschreibung`/`erzaehlung` are omitted (mobile parity, module doc
// comment in the mobile source: an empty-list category is a dead end).
// ---------------------------------------------------------------------------

interface SubgenreEntry {
  readonly id: SprechenSubgenre;
  readonly labelKey: string;
}

const SUBGENRES: readonly SubgenreEntry[] = [
  { id: "praesentation", labelKey: "picker.subgenres.praesentation" },
  { id: "vortrag", labelKey: "picker.subgenres.vortrag" },
  { id: "referat", labelKey: "picker.subgenres.referat" },
];

/**
 * User-facing cert label. Proper nouns rendered in canonical casing —
 * ported verbatim from mobile's hardcoded `CERT_LABELS` (brand-voice
 * §12), not sourced from `sprechen.json`.
 */
const CERT_LABELS: Readonly<Record<SprechenCertCode, string>> = {
  GOETHE: "Goethe",
  OESD: "ÖSD",
  GOETHE_OESD: "Goethe / ÖSD",
  TELC: "telc",
  TESTDAF: "TestDaF",
  DSH: "DSH",
  ECL: "ECL",
};

function pickInitialLevel(examLevelLower: string): SprechenPickerLevel {
  const upper = examLevelLower.toUpperCase();
  return upper === "B2" ? "B2" : "B1";
}

/**
 * Resolve the user's exam board to the cert code sent to `topics-list`.
 * Mirrors mobile's `pickPrimaryCertCode` — boards spanning multiple certs
 * send their primary code only; boards with no `qb_certifications` row
 * (`pflege`) yield `undefined` (no filter).
 */
function pickPrimaryCertCode(board: ExamBoard): SprechenCertCode | undefined {
  const codes = CERT_CODES_BY_BOARD[board];
  return codes[0] as SprechenCertCode | undefined;
}

/**
 * `NEXT_PUBLIC_MONOLOGUE_CUSTOM_THEME_ENABLED` — web port of mobile's
 * `isMonologueCustomThemeEnabled()` (`core/flags/monologueCustomTheme.ts`).
 * Default-OFF; truthy strings (case-insensitive): "true"/"1"/"on"/"yes".
 * Read on every call (literal dot-notation per Constraint 3) so tests can
 * flip the env mid-suite.
 */
function isMonologueCustomThemeEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_MONOLOGUE_CUSTOM_THEME_ENABLED;
  if (raw === undefined) return false;
  const v = raw.trim().toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

// ---------------------------------------------------------------------------
// `useTopicCatalog` — verbatim port of mobile's hook, folded into this file.
// Cache-keep rule: a refetch failure never blanks previously-loaded rows for
// the CURRENT (subgenre, level, certCode) tuple; a fresh tuple resets the
// "have data" flag so a genuine failure surfaces `isError`.
// ---------------------------------------------------------------------------

interface UseTopicCatalogArgs {
  readonly subgenre?: SprechenSubgenre;
  readonly level?: SprechenPickerLevel;
  readonly certCode?: SprechenCertCode;
  readonly enabled?: boolean;
}

interface UseTopicCatalogResult {
  readonly topics: readonly TopicCard[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isRefetching: boolean;
  readonly usedFallback: boolean;
  readonly refetch: () => Promise<void>;
}

function useTopicCatalog(args: UseTopicCatalogArgs): UseTopicCatalogResult {
  const { subgenre, level, certCode } = args;
  const enabled = args.enabled ?? true;

  const [topics, setTopics] = useState<readonly TopicCard[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [isError, setIsError] = useState<boolean>(false);
  const [isRefetching, setIsRefetching] = useState<boolean>(false);
  const [usedFallback, setUsedFallback] = useState<boolean>(false);

  // Tracks whether we have any previous successful payload for the CURRENT
  // (subgenre, level, certCode) tuple. Reset whenever args change.
  const hasDataRef = useRef<boolean>(false);

  const refetch = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    setIsRefetching(true);
    try {
      const rows = await fetchTopics({
        ...(subgenre !== undefined ? { subgenre } : {}),
        ...(level !== undefined ? { level } : {}),
        ...(certCode !== undefined ? { certCode } : {}),
      });

      if (rows.length === 0 && certCode !== undefined) {
        const fallbackRows = await fetchTopics({
          ...(subgenre !== undefined ? { subgenre } : {}),
          ...(level !== undefined ? { level } : {}),
        });
        setTopics(sortTopicsByCert(fallbackRows, certCode));
        setUsedFallback(true);
      } else {
        setTopics(rows);
        setUsedFallback(false);
      }

      setIsError(false);
      hasDataRef.current = true;
    } catch {
      if (!hasDataRef.current) setIsError(true);
    } finally {
      setIsRefetching(false);
    }
  }, [enabled, subgenre, level, certCode]);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    hasDataRef.current = false;
    setIsLoading(true);
    (async () => {
      try {
        const rows = await fetchTopics({
          ...(subgenre !== undefined ? { subgenre } : {}),
          ...(level !== undefined ? { level } : {}),
          ...(certCode !== undefined ? { certCode } : {}),
        });
        if (cancelled) return;

        if (rows.length === 0 && certCode !== undefined) {
          const fallbackRows = await fetchTopics({
            ...(subgenre !== undefined ? { subgenre } : {}),
            ...(level !== undefined ? { level } : {}),
          });
          if (cancelled) return;
          setTopics(sortTopicsByCert(fallbackRows, certCode));
          setUsedFallback(true);
        } else {
          setTopics(rows);
          setUsedFallback(false);
        }

        setIsError(false);
        hasDataRef.current = true;
      } catch {
        if (cancelled) return;
        if (!hasDataRef.current) setIsError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, subgenre, level, certCode]);

  return { topics, isLoading, isError, isRefetching, usedFallback, refetch };
}

// ---------------------------------------------------------------------------
// Level popover — accessible listbox port of mobile `LevelChip` (Constraint 8).
// ---------------------------------------------------------------------------

const ACTIVE_LEVELS: ReadonlySet<SprechenPickerLevel> = new Set(["B1", "B2", "C1", "C2"]);
const ALL_LEVELS: readonly SprechenPickerLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

function LevelPopover({
  value,
  onChange,
  title,
  disabledLabel,
  testID,
}: {
  readonly value: SprechenPickerLevel;
  readonly onChange: (next: SprechenPickerLevel) => void;
  readonly title: string;
  readonly disabledLabel: string;
  readonly testID: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const enabledLevels = ALL_LEVELS.filter((l) => ACTIVE_LEVELS.has(l));

  // Constraint 8 focus restore: every close path (pick, Escape, backdrop)
  // routes through this single `close`, so focus always lands back on the
  // trigger button that opened the panel.
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Constraint 8 focus-on-open — `SchreibenEditorScreen.tsx:130-140`
  // pattern: `tabIndex={-1}` panel + a `useEffect` keyed on the open flag
  // takes programmatic focus. Also seeds the roving highlight on the
  // currently selected level.
  useEffect(() => {
    if (!open) return;
    const idx = enabledLevels.indexOf(value);
    setActiveIndex(idx >= 0 ? idx : 0);
    panelRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handlePick = useCallback(
    (level: SprechenPickerLevel) => {
      if (!ACTIVE_LEVELS.has(level)) return;
      close();
      if (level !== value) onChange(level);
    },
    [close, onChange, value]
  );

  const handlePanelKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, enabledLevels.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          break;
        case "Home":
          e.preventDefault();
          setActiveIndex(0);
          break;
        case "End":
          e.preventDefault();
          setActiveIndex(enabledLevels.length - 1);
          break;
        case "Enter":
        case " ": {
          e.preventDefault();
          const picked = enabledLevels[activeIndex] ?? value;
          handlePick(picked);
          break;
        }
        case "Escape":
          close();
          break;
        default:
          break;
      }
    },
    [activeIndex, close, handlePick, enabledLevels, value]
  );

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        data-testid={testID}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${title}: ${value}`}
        onClick={() => (open ? close() : setOpen(true))}
        className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-full)] border border-cta bg-cta px-4 py-1"
      >
        <AppText tone="inverse" size="small" weight="medium">
          {value}
        </AppText>
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label={title}
            data-testid={`${testID}-backdrop`}
            onClick={close}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            ref={panelRef}
            tabIndex={-1}
            role="listbox"
            aria-label={title}
            aria-activedescendant={`${testID}-option-${enabledLevels[activeIndex]}`}
            data-testid={`${testID}-listbox`}
            onKeyDown={handlePanelKeyDown}
            className="absolute left-0 top-full z-20 mt-1 flex min-w-40 flex-col gap-1 rounded-[var(--radius-md)] border border-line-soft bg-bg-card p-2 shadow-sm outline-none"
          >
            {ALL_LEVELS.map((level) => {
              const active = ACTIVE_LEVELS.has(level);
              const isCurrent = level === value;
              if (!active) {
                return (
                  <div
                    key={level}
                    className="flex items-center justify-between gap-2 px-2 py-1 opacity-55"
                  >
                    <AppText size="small">{level}</AppText>
                    <Chip label={disabledLabel} />
                  </div>
                );
              }
              const isActive = level === enabledLevels[activeIndex];
              return (
                <button
                  key={level}
                  id={`${testID}-option-${level}`}
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  data-testid={`${testID}-option-${level}`}
                  onClick={() => handlePick(level)}
                  className={clsx(
                    "rounded-[var(--radius-sm)] px-2 py-1 text-left hover:bg-bg-subtle",
                    (isCurrent || isActive) && "bg-bg-subtle"
                  )}
                >
                  <AppText size="small" weight={isCurrent ? "semi" : "regular"}>
                    {level}
                  </AppText>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subgenre popover — accessible listbox port of mobile `SubgenreSelect`.
// ---------------------------------------------------------------------------

interface SubgenreOption {
  readonly id: SprechenSubgenre;
  readonly label: string;
}

function SubgenrePopover({
  value,
  options,
  onChange,
  title,
  testID,
  optionTestIDPrefix,
}: {
  readonly value: SprechenSubgenre;
  readonly options: readonly SubgenreOption[];
  readonly onChange: (next: SprechenSubgenre) => void;
  readonly title: string;
  readonly testID: string;
  readonly optionTestIDPrefix: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const activeLabel = useMemo(
    () => options.find((o) => o.id === value)?.label ?? value,
    [options, value]
  );

  // Constraint 8 focus restore: every close path (pick, Escape, backdrop)
  // routes through this single `close`, so focus always lands back on the
  // trigger button that opened the panel.
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Constraint 8 focus-on-open — `SchreibenEditorScreen.tsx:130-140`
  // pattern: `tabIndex={-1}` panel + a `useEffect` keyed on the open flag
  // takes programmatic focus. Also seeds the roving highlight on the
  // currently selected subgenre.
  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.id === value);
    setActiveIndex(idx >= 0 ? idx : 0);
    panelRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handlePick = useCallback(
    (next: SprechenSubgenre) => {
      close();
      if (next !== value) onChange(next);
    },
    [close, onChange, value]
  );

  const handlePanelKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, options.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          break;
        case "Home":
          e.preventDefault();
          setActiveIndex(0);
          break;
        case "End":
          e.preventDefault();
          setActiveIndex(options.length - 1);
          break;
        case "Enter":
        case " ": {
          e.preventDefault();
          const picked = options[activeIndex] ?? options[0];
          if (picked) handlePick(picked.id);
          break;
        }
        case "Escape":
          close();
          break;
        default:
          break;
      }
    },
    [activeIndex, close, handlePick, options]
  );

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        data-testid={testID}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${title}: ${activeLabel}`}
        onClick={() => (open ? close() : setOpen(true))}
        className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-full)] border border-cta bg-cta px-4 py-1"
      >
        <AppText tone="inverse" size="small" weight="medium">
          {activeLabel}
        </AppText>
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label={title}
            data-testid={`${testID}-backdrop`}
            onClick={close}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            ref={panelRef}
            tabIndex={-1}
            role="listbox"
            aria-label={title}
            aria-activedescendant={`${optionTestIDPrefix}-${options[activeIndex]?.id}`}
            data-testid={`${testID}-listbox`}
            onKeyDown={handlePanelKeyDown}
            className="absolute left-0 top-full z-20 mt-1 flex min-w-40 flex-col gap-1 rounded-[var(--radius-md)] border border-line-soft bg-bg-card p-2 shadow-sm outline-none"
          >
            {options.map((option, index) => {
              const isCurrent = option.id === value;
              const isActive = index === activeIndex;
              return (
                <button
                  key={option.id}
                  id={`${optionTestIDPrefix}-${option.id}`}
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  data-testid={`${optionTestIDPrefix}-${option.id}`}
                  onClick={() => handlePick(option.id)}
                  className={clsx(
                    "rounded-[var(--radius-sm)] px-2 py-1 text-left hover:bg-bg-subtle",
                    (isCurrent || isActive) && "bg-bg-subtle"
                  )}
                >
                  <AppText size="small" weight={isCurrent ? "semi" : "regular"}>
                    {option.label}
                  </AppText>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TopicPickerScreen
// ---------------------------------------------------------------------------

export function TopicPickerScreen() {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["sprechen"]);

  const board = useExamContextStore((s) => s.board);
  const examLevel = useExamContextStore((s) => s.level);
  const isExamContextLoaded = useExamContextStore((s) => s.isLoaded);
  const setHandoffTopic = useTopicHandoff((s) => s.setTopic);

  // No ancestor hydrates the exam-context store for this route — same
  // idiom as `PromptListScreen`/`PracticeHubScreen`.
  useEffect(() => {
    void hydrateExamContext();
  }, []);

  const [showAll, setShowAll] = useState(false);
  const [subgenre, setSubgenre] = useState<SprechenSubgenre>("praesentation");
  const [level, setLevel] = useState<SprechenPickerLevel>(() => pickInitialLevel(examLevel));
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Read the flag eagerly per render so tests can flip the env mid-suite.
  const customThemeEnabled = isMonologueCustomThemeEnabled();

  const userCertCode = useMemo<SprechenCertCode | undefined>(
    () => pickPrimaryCertCode(board),
    [board]
  );

  const catalogArgs = useMemo(() => {
    const base: {
      subgenre?: SprechenSubgenre;
      level?: SprechenPickerLevel;
      certCode?: SprechenCertCode;
    } = showAll ? {} : { subgenre, level };
    if (!showAll && userCertCode !== undefined) base.certCode = userCertCode;
    return base;
  }, [showAll, subgenre, level, userCertCode]);

  const { topics, isLoading, isError, isRefetching, usedFallback, refetch } = useTopicCatalog({
    ...catalogArgs,
    enabled: isExamContextLoaded,
  });

  // `topic_picker_opened` — once on mount.
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    trackEvent("topic_picker_opened", { subgenre, level });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `topic_picker_fallback_triggered` — fires when fallback mode activates.
  useEffect(() => {
    if (usedFallback) {
      trackEvent("topic_picker_fallback_triggered", { board, level, subgenre });
    }
  }, [usedFallback, board, level, subgenre]);

  // Debounce the search box (250ms) before it drives client-side filtering
  // and the `topic_searched` event.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [search]);

  const filteredTopics = useMemo<readonly TopicCard[]>(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (q.length === 0) return topics;
    return topics.filter((topic) => topic.titleDe.toLowerCase().includes(q));
  }, [topics, debouncedSearch]);

  useEffect(() => {
    const q = debouncedSearch.trim();
    if (q.length === 0) return;
    trackEvent("topic_searched", {
      subgenre,
      level,
      query_length: q.length,
      result_count: filteredTopics.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filteredTopics.length]);

  const handleSubgenreSelect = useCallback(
    (next: SprechenSubgenre) => {
      setSubgenre(next);
      if (showAll) setShowAll(false);
      trackEvent("topic_subgenre_filtered", { subgenre: next, level });
    },
    [level, showAll]
  );

  const handleLevelChange = useCallback(
    (next: SprechenPickerLevel) => {
      const previous = level;
      setLevel(next);
      if (showAll) setShowAll(false);
      trackEvent("level_chip_changed", { previous_level: previous, new_level: next });
    },
    [level, showAll]
  );

  const handleShowAllToggle = useCallback(() => {
    const next = !showAll;
    setShowAll(next);
    trackEvent("topic_scope_changed", { scope: next ? "all" : "my" });
  }, [showAll]);

  const handleAddThemePress = useCallback(() => {
    trackEvent("custom_theme_opened", { subgenre, level });
    router.push(`/${locale}/app/sprechen/new`);
  }, [router, locale, subgenre, level]);

  const handleDialogueEntryPress = useCallback(() => {
    router.push(`/${locale}/app/sprechen/dialogue`);
  }, [router, locale]);

  const handleCardPress = useCallback(
    (topic: TopicCard) => {
      trackEvent("topic_card_started", {
        topic_id: topic.id,
        subgenre: topic.subgenre,
        level: topic.level,
      });
      setHandoffTopic(topic);
      router.push(`/${locale}/app/sprechen/session/${topic.id}`);
    },
    [router, locale, setHandoffTopic]
  );

  const isPageLoading = isLoading || !isExamContextLoaded;

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="sprechen-topic-picker"
    >
      <div className="flex flex-col gap-1">
        <AppText
          as="h1"
          family="serif"
          size="h1"
          weight="bold"
          testID="sprechen-topic-picker-title"
        >
          {t("sprechen:picker.title")}
        </AppText>
        <AppText tone="secondary" size="body" testID="sprechen-topic-picker-subtitle">
          {t("sprechen:picker.subtitle")}
        </AppText>
        {customThemeEnabled ? (
          <button
            type="button"
            data-testid="sprechen-topic-picker-add-theme"
            aria-label={t("sprechen:picker.addTheme")}
            onClick={handleAddThemePress}
            className="mt-2 min-h-11 self-start rounded-[var(--radius-sm)] border border-line-strong bg-bg-card px-4 py-2 transition hover:opacity-90"
          >
            <AppText tone="primary" size="body" weight="semi">
              {t("sprechen:picker.addTheme")}
            </AppText>
          </button>
        ) : null}
      </div>

      {board === "telc" ? (
        <Card
          testID="sprechen-dialogue-entry"
          onClick={handleDialogueEntryPress}
          className="flex flex-col gap-1"
        >
          <AppText family="serif" size="h3" weight="semi">
            {t("sprechen:dialogueEntry.title")}
          </AppText>
          <AppText tone="secondary" size="body">
            {t("sprechen:dialogueEntry.subtitle")}
          </AppText>
        </Card>
      ) : null}

      <div role="group" aria-label={t("sprechen:picker.title")} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            testID="sprechen-topic-picker-scope"
            label={t("sprechen:picker.scopeAll")}
            selected={showAll}
            onClick={handleShowAllToggle}
          />
          <div className={clsx(showAll && "pointer-events-none opacity-40")}>
            <LevelPopover
              testID="sprechen-topic-picker-level"
              value={level}
              onChange={handleLevelChange}
              title={t("sprechen:picker.levelSheetTitle")}
              disabledLabel={t("sprechen:picker.bientot")}
            />
          </div>
          <div className={clsx(showAll && "pointer-events-none opacity-40")}>
            <SubgenrePopover
              testID="sprechen-topic-picker-subgenre-trigger"
              optionTestIDPrefix="sprechen-topic-picker-subgenre"
              value={subgenre}
              options={SUBGENRES.map((entry) => ({
                id: entry.id,
                label: t(`sprechen:${entry.labelKey}`),
              }))}
              onChange={handleSubgenreSelect}
              title={t("sprechen:picker.subgenreSheetTitle")}
            />
          </div>
        </div>

        <Input
          testID="sprechen-topic-picker-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("sprechen:picker.searchPlaceholder")}
          aria-label={t("sprechen:picker.searchPlaceholder")}
          autoCorrect="off"
          autoCapitalize="none"
        />
      </div>

      {isPageLoading ? (
        <div className="flex flex-col gap-3" data-testid="sprechen-topic-picker-loading">
          <Skeleton.Card />
          <Skeleton.Card />
          <Skeleton.Card />
        </div>
      ) : isError ? (
        <div
          className="flex flex-col items-center gap-3 py-8 text-center"
          data-testid="sprechen-topic-picker-error"
        >
          <AppText family="serif" size="h3" weight="semi" align="center">
            {t("sprechen:picker.error.title")}
          </AppText>
          <AppText tone="secondary" size="body" align="center">
            {t("sprechen:picker.error.body")}
          </AppText>
          <AppButton
            testID="sprechen-topic-picker-retry"
            label={t("sprechen:picker.error.retry")}
            onClick={() => void refetch()}
            variant="outline"
          />
        </div>
      ) : filteredTopics.length === 0 ? (
        <EmptyState
          testID="sprechen-topic-picker-empty"
          title={t("sprechen:picker.empty.title")}
          description={t("sprechen:picker.empty.body")}
        />
      ) : (
        <div
          className="flex flex-col gap-3"
          data-testid="sprechen-topic-picker-list"
          aria-busy={isRefetching}
        >
          {filteredTopics.map((topic) => (
            <Card
              key={topic.id}
              testID={`sprechen-topic-card-${topic.id}`}
              onClick={() => handleCardPress(topic)}
              className="flex flex-col gap-1"
            >
              <div className="flex items-center justify-between gap-2">
                <AppText family="serif" size="h3" weight="semi" className="flex-1">
                  {topic.titleDe}
                </AppText>
                {topic.durationLabel ? <Chip label={topic.durationLabel} /> : null}
              </div>
              <AppText tone="secondary" size="body">
                {topic.subtitleFr}
              </AppText>
              {topic.cert !== undefined || (topic.tags && topic.tags.length > 0) ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {topic.cert !== undefined ? (
                    <Chip
                      testID={`sprechen-topic-card-${topic.id}-cert`}
                      label={CERT_LABELS[topic.cert]}
                    />
                  ) : null}
                  {topic.tags?.map((tag) => (
                    <Chip key={tag} label={tag} />
                  ))}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
