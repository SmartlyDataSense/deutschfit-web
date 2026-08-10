/**
 * Unit tests for the SM-2 scheduler.
 *
 * Covers the four ratings on both fresh and graduated cards, the
 * ease-factor bounds, and the `nextDue` computation.
 */
import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  SM2_DEFAULT_EASE,
  SM2_EASE_CEILING,
  SM2_EASE_FLOOR,
  schedule,
} from "../../src/learner/core/srs/sm2";

const FIXED_NOW = new Date("2026-04-23T12:00:00.000Z");

describe("SM-2 scheduler", () => {
  describe("new card (first review)", () => {
    const fresh = { ease: SM2_DEFAULT_EASE, intervalDays: 0 };

    it("schedules 'again' to 1 day and drops ease by 0.2", () => {
      const result = schedule(fresh, "again", FIXED_NOW);
      expect(result.intervalDaysAfter).toBe(1);
      expect(result.easeAfter).toBeCloseTo(SM2_DEFAULT_EASE - 0.2, 5);
      expect(result.nextDue.getTime()).toBe(FIXED_NOW.getTime() + DAY_MS);
    });

    it("schedules 'hard' to 1 day and drops ease by 0.15", () => {
      const result = schedule(fresh, "hard", FIXED_NOW);
      expect(result.intervalDaysAfter).toBe(1);
      expect(result.easeAfter).toBeCloseTo(SM2_DEFAULT_EASE - 0.15, 5);
    });

    it("schedules 'good' to 1 day and keeps ease", () => {
      const result = schedule(fresh, "good", FIXED_NOW);
      expect(result.intervalDaysAfter).toBe(1);
      expect(result.easeAfter).toBe(SM2_DEFAULT_EASE);
    });

    it("schedules 'easy' to 4 days and keeps ease at ceiling", () => {
      const result = schedule(fresh, "easy", FIXED_NOW);
      expect(result.intervalDaysAfter).toBe(4);
      // Ease is already at the ceiling, so +0.15 clamps back to 2.5.
      expect(result.easeAfter).toBe(SM2_EASE_CEILING);
      expect(result.nextDue.getTime()).toBe(FIXED_NOW.getTime() + 4 * DAY_MS);
    });
  });

  describe("graduated card", () => {
    const graduated = { ease: 2.5, intervalDays: 10 };

    it("'again' resets interval to 1 day and drops ease", () => {
      const result = schedule(graduated, "again", FIXED_NOW);
      expect(result.intervalDaysAfter).toBe(1);
      expect(result.easeAfter).toBeCloseTo(2.3, 5);
    });

    it("'good' grows interval by the current ease factor", () => {
      const result = schedule(graduated, "good", FIXED_NOW);
      // 10 × 2.5 = 25 days.
      expect(result.intervalDaysAfter).toBe(25);
      expect(result.easeAfter).toBe(2.5);
    });

    it("'easy' roughly doubles the 'good' interval and bumps ease", () => {
      const result = schedule(graduated, "easy", FIXED_NOW);
      // 10 × 2.5 × 2 = 50 days.
      expect(result.intervalDaysAfter).toBe(50);
      expect(result.easeAfter).toBe(SM2_EASE_CEILING);
    });

    it("'hard' keeps the interval but lowers ease", () => {
      const result = schedule(graduated, "hard", FIXED_NOW);
      expect(result.intervalDaysAfter).toBe(10);
      expect(result.easeAfter).toBeCloseTo(2.35, 5);
    });
  });

  describe("ease bounds [1.3, 2.5]", () => {
    it("clamps floor at 1.3 even after many 'again' ratings", () => {
      let state = { ease: 1.5, intervalDays: 5 };
      for (let i = 0; i < 5; i += 1) {
        const out = schedule(state, "again", FIXED_NOW);
        state = { ease: out.easeAfter, intervalDays: out.intervalDaysAfter };
      }
      expect(state.ease).toBe(SM2_EASE_FLOOR);
    });

    it("clamps ceiling at 2.5 even after many 'easy' ratings", () => {
      let state = { ease: 2.5, intervalDays: 1 };
      for (let i = 0; i < 5; i += 1) {
        const out = schedule(state, "easy", FIXED_NOW);
        state = { ease: out.easeAfter, intervalDays: out.intervalDaysAfter };
      }
      expect(state.ease).toBe(SM2_EASE_CEILING);
    });

    it("defaults a NaN ease to the floor instead of propagating", () => {
      const result = schedule({ ease: Number.NaN, intervalDays: 0 }, "good", FIXED_NOW);
      expect(result.easeAfter).toBe(SM2_EASE_FLOOR);
    });
  });

  describe("Easy doubles interval on graduated cards", () => {
    it("easy on interval=4/ease=2.5 gives 20 days (×2× ease)", () => {
      const result = schedule({ ease: 2.5, intervalDays: 4 }, "easy", FIXED_NOW);
      expect(result.intervalDaysAfter).toBe(20);
    });
  });
});
