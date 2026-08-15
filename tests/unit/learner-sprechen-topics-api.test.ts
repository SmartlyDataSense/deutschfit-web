/**
 * `fetchTopics` / `createTopic` / `sortTopicsByCert` — S7 · Task 7.1.
 *
 * Port of `deutschfit-mobile/src/features/sprechen/topicsApi.ts` (623L) +
 * `utils/sortTopicsByCert.ts`. Web delta: the 24h offline cache is
 * re-homed from mobile's Drizzle `cached_topics` table to the
 * pre-declared Dexie `cachedTopics` table (`core/db/types.ts:92–97`) via
 * `getLearnerDb()` — exercised for real here (jsdom has no `indexedDB`,
 * so `getLearnerDb()` runs the in-memory fallback, same idiom as
 * `learner-content-loader.test.ts`).
 *
 * Mocks only the transport boundary (`@/learner/core/api/client`) per
 * Constraint 15 / this repo's test idiom — `sprechenTopics.ts` itself and
 * the Dexie fallback run for real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rawGetMock, invokeFnMock, ApiErrorCtor } = vi.hoisted(() => {
  class ApiError extends Error {
    readonly bodyJson?: unknown;
    constructor(
      readonly status: number,
      readonly code: string,
      readonly detail?: string,
      bodyJson?: unknown
    ) {
      super(detail ?? code);
      this.name = "ApiError";
      this.bodyJson = bodyJson;
    }
  }
  return {
    rawGetMock: vi.fn(),
    invokeFnMock: vi.fn(),
    ApiErrorCtor: ApiError,
  };
});

vi.mock("@/learner/core/api/client", () => ({
  rawGet: rawGetMock,
  invokeFn: invokeFnMock,
  ApiError: ApiErrorCtor,
}));

import { __resetLearnerDbForTests, getLearnerDb } from "@/learner/core/db";
import {
  createTopic,
  fetchTopics,
  sortTopicsByCert,
  SUBGENRE_BY_LEVEL,
  type TopicCard,
} from "@/learner/core/api/sprechenTopics";
import * as examApi from "@/learner/core/api/examApi";
import type {
  CreateTopicInput as FacadeCreateTopicInput,
  SprechenCertCode as FacadeSprechenCertCode,
  SprechenPickerLevel as FacadeSprechenPickerLevel,
  SprechenSubgenre as FacadeSprechenSubgenre,
  TopicCard as FacadeTopicCard,
} from "@/learner/core/api/examApi";

function serverRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "topic-1",
    title_de: "Mein Lieblingsbuch",
    subtitle_de: "Parle de ton livre préféré.",
    level: "B1",
    subgenre: "praesentation",
    cert_code: "GOETHE",
    outline_steps: [{ order: 1, de: "Nenne den Titel.", fr: "Donne le titre." }],
    ...overrides,
  };
}

describe("fetchTopics", () => {
  beforeEach(async () => {
    __resetLearnerDbForTests();
    rawGetMock.mockReset();
  });

  it("maps a server row (snake_case + outline_steps) to TopicCard and writes the Dexie cache row", async () => {
    rawGetMock.mockResolvedValueOnce({
      subgenre: "praesentation",
      level: "B1",
      cert_code: "GOETHE",
      topics: [serverRow()],
    });

    const topics = await fetchTopics({ subgenre: "praesentation", level: "B1" });

    expect(rawGetMock).toHaveBeenCalledWith("topics-list", {
      subgenre: "praesentation",
      level: "B1",
    });
    const expected: TopicCard = {
      id: "topic-1",
      subgenre: "praesentation",
      level: "B1",
      titleDe: "Mein Lieblingsbuch",
      subtitleFr: "Parle de ton livre préféré.",
      cert: "GOETHE",
      outlineSteps: [{ order: 1, de: "Nenne den Titel.", fr: "Donne le titre." }],
    };
    expect(topics).toEqual([expected]);

    const db = await getLearnerDb();
    const row = await db.cachedTopics.get(["praesentation", "B1"]);
    expect(row).toBeDefined();
    expect(JSON.parse((row as { payload: string }).payload)).toEqual([expected]);
  });

  it("serves the cache when a second call's transport rejects and fetched_at is < 24h old", async () => {
    rawGetMock.mockResolvedValueOnce({
      subgenre: "vortrag",
      level: "B2",
      topics: [serverRow({ id: "topic-2", subgenre: "vortrag", level: "B2", cert_code: "TELC" })],
    });
    const first = await fetchTopics({ subgenre: "vortrag", level: "B2" });
    expect(first).toHaveLength(1);

    rawGetMock.mockRejectedValueOnce(new ApiErrorCtor(0, "topics_list_transport_error"));
    const second = await fetchTopics({ subgenre: "vortrag", level: "B2" });

    expect(second).toEqual(first);
  });

  it("re-throws when the transport fails and no fresh cache row exists", async () => {
    rawGetMock.mockRejectedValueOnce(new ApiErrorCtor(500, "topics_list_transport_error"));
    await expect(fetchTopics({ subgenre: "referat", level: "B2" })).rejects.toThrow(
      "topics_list_transport_error"
    );
  });

  it("does not serve a stale (>= 24h) cache row", async () => {
    const db = await getLearnerDb();
    await db.cachedTopics.put({
      subgenre: "praesentation",
      level: "B1",
      payload: JSON.stringify([{ id: "stale-1" }]),
      fetched_at: Date.now() - 25 * 60 * 60 * 1000,
    });
    rawGetMock.mockRejectedValueOnce(new ApiErrorCtor(500, "topics_list_transport_error"));

    await expect(fetchTopics({ subgenre: "praesentation", level: "B1" })).rejects.toThrow(
      "topics_list_transport_error"
    );
  });

  it("drops malformed rows via the validators", async () => {
    rawGetMock.mockResolvedValueOnce({
      subgenre: "praesentation",
      level: "B1",
      topics: [
        serverRow({ id: "good-1" }),
        serverRow({ id: "bad-1", subgenre: "not-a-real-subgenre" }),
        { id: "bad-2" /* missing subgenre/level/title_de */ },
      ],
    });

    const topics = await fetchTopics({ subgenre: "praesentation", level: "B1" });

    expect(topics.map((t) => t.id)).toEqual(["good-1"]);
  });
});

describe("createTopic", () => {
  beforeEach(() => {
    __resetLearnerDbForTests();
    invokeFnMock.mockReset();
  });

  it("posts a snake_case body", async () => {
    invokeFnMock.mockResolvedValueOnce({
      topic: { id: "new-1", title_de: "Mein Thema", situation_de: "Eine Situation." },
    });

    const result = await createTopic({
      certCode: "GOETHE",
      level: "B1",
      titleDe: "Mein Thema",
      descriptionDe: "Eine Situation.",
      minDurationS: 60,
      maxDurationS: 180,
    });

    expect(invokeFnMock).toHaveBeenCalledWith("topic-create", {
      method: "POST",
      body: {
        cert_code: "GOETHE",
        level: "B1",
        title_de: "Mein Thema",
        description_de: "Eine Situation.",
        min_duration_s: 60,
        max_duration_s: 180,
      },
    });
    expect(result.id).toBe("new-1");
    expect(result.subgenre).toBe(SUBGENRE_BY_LEVEL.B1);
  });

  it("throws grader_unavailable_for_pair on the 422 code", async () => {
    invokeFnMock.mockRejectedValueOnce(new ApiErrorCtor(422, "grader_unavailable_for_pair"));
    await expect(
      createTopic({
        certCode: "GOETHE",
        level: "B1",
        titleDe: "x",
        descriptionDe: "y",
        minDurationS: 60,
        maxDurationS: 180,
      })
    ).rejects.toThrow("grader_unavailable_for_pair");
  });

  it("clears cachedTopics on success", async () => {
    const db = await getLearnerDb();
    await db.cachedTopics.put({
      subgenre: "praesentation",
      level: "B1",
      payload: JSON.stringify([{ id: "stale-1" }]),
      fetched_at: Date.now(),
    });
    await db.cachedTopics.put({
      subgenre: "vortrag",
      level: "B2",
      payload: JSON.stringify([{ id: "stale-2" }]),
      fetched_at: Date.now(),
    });
    invokeFnMock.mockResolvedValueOnce({
      topic: { id: "new-1", title_de: "Mein Thema", situation_de: null },
    });

    await createTopic({
      certCode: "GOETHE",
      level: "B1",
      titleDe: "Mein Thema",
      descriptionDe: "Eine Situation.",
      minDurationS: 60,
      maxDurationS: 180,
    });

    expect(await db.cachedTopics.toArray()).toHaveLength(0);
  });
});

describe("sortTopicsByCert", () => {
  const topics: TopicCard[] = [
    {
      id: "1",
      subgenre: "praesentation",
      level: "B1",
      titleDe: "A",
      subtitleFr: "a",
      cert: "TELC",
    },
    {
      id: "2",
      subgenre: "praesentation",
      level: "B1",
      titleDe: "B",
      subtitleFr: "b",
      cert: "GOETHE",
    },
    {
      id: "3",
      subgenre: "praesentation",
      level: "B1",
      titleDe: "C",
      subtitleFr: "c",
      cert: "GOETHE",
    },
    {
      id: "4",
      subgenre: "praesentation",
      level: "B1",
      titleDe: "D",
      subtitleFr: "d",
      cert: "OESD",
    },
  ];

  it("is stable with the user's cert first", () => {
    const sorted = sortTopicsByCert(topics, "GOETHE");
    expect(sorted.map((t) => t.id)).toEqual(["2", "3", "1", "4"]);
  });

  it("returns topics unchanged when userCertCode is undefined", () => {
    expect(sortTopicsByCert(topics, undefined).map((t) => t.id)).toEqual(["1", "2", "3", "4"]);
  });
});

describe("facade re-exports (examApi)", () => {
  it("resolves the sprechen topics wire functions from the facade — identical references", () => {
    expect(examApi.fetchTopics).toBe(fetchTopics);
    expect(examApi.createTopic).toBe(createTopic);
    expect(examApi.sortTopicsByCert).toBe(sortTopicsByCert);
    expect(examApi.SUBGENRE_BY_LEVEL).toBe(SUBGENRE_BY_LEVEL);
  });

  it("type-level: sprechen topics types resolve through the facade (compile-time; npm run typecheck enforces this)", () => {
    const subgenre: FacadeSprechenSubgenre = "praesentation";
    const level: FacadeSprechenPickerLevel = "B1";
    const cert: FacadeSprechenCertCode = "GOETHE";
    const card: FacadeTopicCard = {
      id: "id",
      subgenre,
      level,
      titleDe: "t",
      subtitleFr: "s",
      cert,
    };
    const createInput: FacadeCreateTopicInput = {
      certCode: "GOETHE",
      level: "B1",
      titleDe: "t",
      descriptionDe: "d",
      minDurationS: 60,
      maxDurationS: 120,
    };

    expect(card.id).toBe("id");
    expect(createInput.certCode).toBe("GOETHE");
  });
});

afterEach(() => {
  __resetLearnerDbForTests();
});
