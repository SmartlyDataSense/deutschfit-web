/**
 * Profil fixtures — web port of
 * `mobile/src/features/profil/data/fixtures.ts`. Verbatim shape: only
 * `emptyProfilStats` — the first-run defaults used when there is no
 * cache row and no signed-in user.
 */

export type ExamLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface ProfilStats {
  /** Display name shown on the identity card. */
  fullName: string;
  /** City + country subtitle line. */
  location: string;
  /** Language codes rendered after the city. */
  languages: string[];
  /** Exam track label (e.g. "Goethe B2"). */
  examLabel: string;
  /** Days remaining until the user's scheduled exam date. */
  daysRemaining: number;
  /** Daily reminder time (HH:MM, 24h). */
  reminderTime: string;
  /** Offline lessons cached on device. */
  offlineLessonsCount: number;
  /** Total size of the offline bundle in MB. */
  offlineSizeMb: number;
  /** Whether the data-saver / reduced-data mode is active. */
  dataSaverOn: boolean;
  /** Legacy CEFR level kept for back-compat with earlier v0 callers. */
  legacyLevel: string;
  /** Lessons completed — legacy counter kept for back-compat. */
  lessonsCompleted: number;
}

export const emptyProfilStats: ProfilStats = {
  fullName: "",
  location: "",
  languages: [],
  examLabel: "",
  daysRemaining: 0,
  reminderTime: "",
  offlineLessonsCount: 0,
  offlineSizeMb: 0,
  dataSaverOn: false,
  legacyLevel: "",
  lessonsCompleted: 0,
};
