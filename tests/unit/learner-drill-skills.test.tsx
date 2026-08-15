/**
 * `Mes points` skill-profile surface — S9 · Task 9.7.
 *
 * Three units under test, each in its own describe block:
 *   - `classifySkill` — the bucket-threshold table (design doc §8).
 *   - `fetchSkillProfile` — the `user_concept_mastery` PostgREST read,
 *     including the object/array `drill_skill` embed shapes and the
 *     concept_code label fallback.
 *   - `DrillSkillProfileScreen` — bucket grouping/order, empty/error
 *     states, and the footer CTA route.
 *
 * The screen suite deliberately reuses the same `getBrowserClient` mock
 * as the `fetchSkillProfile` suite (driving `mockOrder`'s resolved
 * value) instead of mocking `skillProfileClient` itself — mocking that
 * module at file scope would also intercept the direct
 * `fetchSkillProfile` import the first suite needs to exercise the real
 * implementation, since `vi.mock` calls are hoisted file-wide, not
 * scoped to a `describe` block.
 *
 * All `vi.mock` calls sit at module top level for the same reason —
 * nesting one inside a `describe`/`it` only *looks* scoped; vitest
 * still hoists it globally and (as of v4) warns that the visual nesting
 * doesn't reflect actual execution order.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockFrom, mockSelect, mockOrder } = vi.hoisted(() => {
  const mockOrder = vi.fn();
  const mockSelect = vi.fn(() => ({ order: mockOrder }));
  const mockFrom = vi.fn(() => ({ select: mockSelect }));
  return { mockFrom, mockSelect, mockOrder };
});
vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({ from: mockFrom }),
}));

vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

import { BUCKET_ORDER, classifySkill } from "@/learner/drill/logic/skillBuckets";
import { fetchSkillProfile } from "@/learner/drill/api/skillProfileClient";
import { initLearnerI18n } from "@/learner/core/i18n";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import { DrillSkillProfileScreen } from "@/learner/drill/screens/DrillSkillProfileScreen";

beforeEach(() => {
  mockFrom.mockClear();
  mockSelect.mockClear();
  mockOrder.mockReset();
});

// ─── classifySkill ──────────────────────────────────────────────────────────

describe("classifySkill", () => {
  it("returns not_assessed when there are no attempts, regardless of mastery", () => {
    expect(classifySkill(0, 0.95)).toBe("not_assessed");
    expect(classifySkill(0, 0)).toBe("not_assessed");
  });

  it("returns renforcer below 0.6 mastery", () => {
    expect(classifySkill(1, 0.59)).toBe("renforcer");
  });

  it("returns progres in the [0.6, 0.8) band", () => {
    expect(classifySkill(1, 0.6)).toBe("progres");
    expect(classifySkill(1, 0.79)).toBe("progres");
  });

  it("returns maitrise at or above 0.8", () => {
    expect(classifySkill(1, 0.8)).toBe("maitrise");
  });
});

describe("BUCKET_ORDER", () => {
  it("is exactly renforcer, progres, maitrise, not_assessed in that order", () => {
    expect(BUCKET_ORDER).toEqual(["renforcer", "progres", "maitrise", "not_assessed"]);
  });
});

// ─── fetchSkillProfile ──────────────────────────────────────────────────────

describe("fetchSkillProfile", () => {
  it("maps object-shaped drill_skill embeds onto SkillProfileRow", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [
        {
          concept_code: "perfekt_aux",
          p_mastery: 0.42,
          attempts: 6,
          drill_skill: { name_fr: "Le parfait" },
        },
      ],
      error: null,
    });

    const rows = await fetchSkillProfile();

    expect(mockFrom).toHaveBeenCalledWith("user_concept_mastery");
    expect(rows).toEqual([
      { concept_code: "perfekt_aux", label: "Le parfait", attempts: 6, mastery: 0.42 },
    ]);
  });

  it("maps array-shaped drill_skill embeds (single-element array) onto SkillProfileRow", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [
        {
          concept_code: "kasus_akk",
          p_mastery: 0.9,
          attempts: 3,
          drill_skill: [{ name_fr: "L'accusatif" }],
        },
      ],
      error: null,
    });

    const rows = await fetchSkillProfile();
    expect(rows[0]?.label).toBe("L'accusatif");
  });

  it("falls back to concept_code when the drill_skill relation is missing", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [{ concept_code: "dativ_praep", p_mastery: 0.1, attempts: 0, drill_skill: null }],
      error: null,
    });

    const rows = await fetchSkillProfile();
    expect(rows[0]?.label).toBe("dativ_praep");
  });

  it("throws when the query errors", async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    await expect(fetchSkillProfile()).rejects.toThrow("boom");
  });

  it("returns an empty array when there are no rows", async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });

    await expect(fetchSkillProfile()).resolves.toEqual([]);
  });
});

// ─── DrillSkillProfileScreen ────────────────────────────────────────────────

describe("DrillSkillProfileScreen", () => {
  beforeAll(() => {
    initLearnerI18n("fr");
  });

  afterEach(() => {
    cleanup();
  });

  function renderScreen() {
    return render(
      <LearnerI18nProvider lng="fr">
        <DrillSkillProfileScreen />
      </LearnerI18nProvider>
    );
  }

  it("groups rows under bucket headings, rendered in BUCKET_ORDER, omitting empty buckets", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [
        // renforcer
        {
          concept_code: "akkusativ",
          p_mastery: 0.4,
          attempts: 5,
          drill_skill: { name_fr: "Akkusativ" },
        },
        // maitrise
        {
          concept_code: "perfekt",
          p_mastery: 0.9,
          attempts: 6,
          drill_skill: { name_fr: "Perfekt" },
        },
        // not_assessed
        { concept_code: "dativ", p_mastery: 0, attempts: 0, drill_skill: { name_fr: "Dativ" } },
        // no "progres" row on purpose — that bucket must be omitted entirely.
      ],
      error: null,
    });

    renderScreen();

    await waitFor(() => expect(screen.getByText("Akkusativ")).toBeInTheDocument());
    expect(screen.getByText("Perfekt")).toBeInTheDocument();
    expect(screen.getByText("Dativ")).toBeInTheDocument();

    // Bucket headings appear in document order == BUCKET_ORDER, filtered to
    // the buckets actually present (progres is skipped: no row lands there).
    const headings = screen.getAllByTestId(/^drill-skill-profile-bucket-/);
    expect(headings.map((h) => h.dataset.testid)).toEqual([
      "drill-skill-profile-bucket-renforcer",
      "drill-skill-profile-bucket-maitrise",
      "drill-skill-profile-bucket-not_assessed",
    ]);
    expect(screen.queryByTestId("drill-skill-profile-bucket-progres")).not.toBeInTheDocument();

    // Bucket heading copy comes from drill:skillProfile.bucket.*.
    expect(screen.getByTestId("drill-skill-profile-bucket-renforcer")).toHaveTextContent(
      "À renforcer"
    );
    expect(screen.getByTestId("drill-skill-profile-bucket-maitrise")).toHaveTextContent("Maîtrisé");
    expect(screen.getByTestId("drill-skill-profile-bucket-not_assessed")).toHaveTextContent(
      "Pas encore évalué"
    );
  });

  it("renders the empty state when the profile has no rows", async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });

    renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId("drill-skill-profile-empty")).toBeInTheDocument()
    );
    expect(
      screen.getByText("Fais une première séance pour voir tes points ici.")
    ).toBeInTheDocument();
  });

  it("renders the error state when the fetch rejects", async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId("drill-skill-profile-error")).toBeInTheDocument()
    );
    expect(
      screen.getByText("Impossible de charger tes points pour le moment.")
    ).toBeInTheDocument();
  });

  it("renders a CTA linking to /{locale}/app/drill/session", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [
        {
          concept_code: "akkusativ",
          p_mastery: 0.4,
          attempts: 5,
          drill_skill: { name_fr: "Akkusativ" },
        },
      ],
      error: null,
    });

    renderScreen();

    const cta = await screen.findByTestId("drill-skill-profile-cta");
    expect(cta).toHaveTextContent("Commencer une séance");
    expect(cta).toHaveAttribute("href", "/fr/app/drill/session");
  });
});
