import { describe, expect, it } from "vitest";

import { computeHeroState } from "@/learner/accueil/heroState";
import { formatDateEyebrow } from "@/learner/accueil/formatDateEyebrow";
import { greetingName } from "@/learner/accueil/greetingName";

describe("computeHeroState (founding-doc §8 port)", () => {
  it("priority: post-session > session-ready > idle > countdown", () => {
    const base = { daysUntilExam: 30, submissionsCount: 2, readinessScore: 70 };
    expect(
      computeHeroState({
        ...base,
        submission: { status: "graded", ageHours: 1 },
        prescription: { title: "Drill" },
        hoursSinceLastSession: 999,
      }).state
    ).toBe("post-session");
    expect(
      computeHeroState({
        ...base,
        prescription: { title: "Drill", durationMinutes: 8 },
        hoursSinceLastSession: 999,
      }).state
    ).toBe("session-ready");
    expect(computeHeroState({ ...base, hoursSinceLastSession: 7 * 24 }).state).toBe("idle");
    expect(computeHeroState(base).state).toBe("countdown");
  });

  it("post-session ages out after 24h; graded is a milestone; unseen adds the pulse line", () => {
    const fresh = computeHeroState({
      daysUntilExam: 10,
      submission: { status: "graded", ageHours: 2, correctionUnseen: true },
    });
    expect(fresh).toMatchObject({
      state: "post-session",
      milestone: true,
      readinessPulse: "Une nouvelle correction t'attend.",
      headline: "Ta correction est prête.",
    });
    const stale = computeHeroState({
      daysUntilExam: 10,
      submission: { status: "graded", ageHours: 25 },
    });
    expect(stale.state).toBe("countdown");
    const pending = computeHeroState({
      daysUntilExam: 10,
      submission: { status: "pending", ageHours: 1 },
    });
    expect(pending).toMatchObject({ milestone: false, headline: "Soumission bien reçue." });
  });

  it("content axis drives prep bar + readiness (A/B/C/D)", () => {
    expect(computeHeroState({ daysUntilExam: null })).toMatchObject({
      content: "cold",
      showPreparationBar: false,
      readiness: null,
      headline: "On commence quand tu veux.",
    });
    expect(
      computeHeroState({ daysUntilExam: null, submissionsCount: 3, readinessScore: 55 })
    ).toMatchObject({
      content: "readiness-only",
      showPreparationBar: false,
      readiness: { score: 55, target: 80 },
      headline: "Tu avances bien.",
    });
    expect(computeHeroState({ daysUntilExam: 40, submissionsCount: 0 })).toMatchObject({
      content: "countdown-only",
      showPreparationBar: false,
      readiness: null,
    });
    expect(
      computeHeroState({ daysUntilExam: 40, submissionsCount: 2, readinessScore: 91 })
    ).toMatchObject({
      content: "full",
      showPreparationBar: true,
      readiness: { score: 91, target: 80 },
    });
  });

  it("tone escalates only under 21 days AND below the pass threshold; jour J is a milestone", () => {
    expect(
      computeHeroState({ daysUntilExam: 14, submissionsCount: 1, readinessScore: 45 }).tone
    ).toBe("escalated");
    expect(
      computeHeroState({ daysUntilExam: 14, submissionsCount: 1, readinessScore: 75 }).tone
    ).toBe("calm");
    expect(
      computeHeroState({ daysUntilExam: 40, submissionsCount: 1, readinessScore: 45 }).tone
    ).toBe("calm");
    expect(computeHeroState({ daysUntilExam: 0 })).toMatchObject({
      milestone: true,
      headline: "C'est le jour J.",
      daysUntilExam: 0,
    });
    expect(computeHeroState({ daysUntilExam: -3 }).daysUntilExam).toBe(0); // negative clamps
  });
});

describe("greetingName / formatDateEyebrow", () => {
  it("falls displayName → email local-part → fallback", () => {
    expect(greetingName("  Amadou ", "x@y.z", "fb")).toBe("Amadou");
    expect(greetingName(null, "marie.k@df.dev", "fb")).toBe("marie.k");
    expect(greetingName("", "not-an-email", "fb")).toBe("fb");
  });
  it("formats WEEKDAY · DAY MONTH uppercased per locale", () => {
    expect(formatDateEyebrow(new Date(2026, 3, 15), "fr-FR")).toBe("MERCREDI · 15 AVRIL");
    expect(formatDateEyebrow(new Date(2026, 3, 15), "en")).toBe("WEDNESDAY · 15 APRIL");
  });
});
