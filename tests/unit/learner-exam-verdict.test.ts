import { describe, expect, it } from "vitest";

import { bandForAccuracy, buildVerdict } from "@/learner/exam/verdict";

describe("bandForAccuracy", () => {
  it("bands the exact 0.7/0.5 thresholds", () => {
    expect(bandForAccuracy(0.7)).toBe("pass");
    expect(bandForAccuracy(0.699)).toBe("borderline");
    expect(bandForAccuracy(0.5)).toBe("borderline");
    expect(bandForAccuracy(0.499)).toBe("fail");
  });

  it("bands NaN as fail", () => {
    expect(bandForAccuracy(NaN)).toBe("fail");
  });
});

describe("buildVerdict", () => {
  // Strings pasted verbatim from deutschfit-mobile/src/features/exam/verdict.ts:35-49 —
  // byte-identical port, brand-voice violations (mixed vous/tu register,
  // "Presque !") included on purpose (issue filed at ship, not fixed here).
  it("returns mobile's byte-identical pass copy at the 0.7 boundary", () => {
    expect(buildVerdict(0.7)).toEqual({
      band: "pass",
      title: "Vous êtes prêt·e.",
      body: "Vous passeriez l'examen aujourd'hui. Consolidez votre niveau avec une session ciblée sur vos 2 points les plus faibles.",
    });
  });

  it("returns mobile's byte-identical borderline copy at the 0.5 boundary", () => {
    expect(buildVerdict(0.5)).toEqual({
      band: "borderline",
      title: "Presque !",
      body: "Tu passerais avec 2 bonnes réponses de plus. Reprends les questions ratées avec le Betreuer pour fermer l'écart.",
    });
  });

  it("returns mobile's byte-identical fail copy below 0.5", () => {
    expect(buildVerdict(0)).toEqual({
      band: "fail",
      title: "Pas encore, mais tenez bon.",
      body: "Il manque encore quelques points clés. Attaquez une révision courte sur votre compétence la plus faible pour grimper rapidement.",
    });
  });

  it("NaN accuracy resolves to the fail copy", () => {
    expect(buildVerdict(NaN)).toEqual({
      band: "fail",
      title: "Pas encore, mais tenez bon.",
      body: "Il manque encore quelques points clés. Attaquez une révision courte sur votre compétence la plus faible pour grimper rapidement.",
    });
  });
});
