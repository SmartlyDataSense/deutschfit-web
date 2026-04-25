import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/database.types";
import { requireOperator } from "@/lib/auth/requireOperator";

type ClientShape = {
  user: { id: string; email?: string | null } | null;
  profile: { is_operator: boolean } | null;
  profileError?: Error;
};

function makeClient({ user, profile, profileError }: ClientShape): SupabaseClient<Database> {
  const fromMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: profile,
          error: profileError ?? null,
        }),
      }),
    }),
  });
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: fromMock,
  } as unknown as SupabaseClient<Database>;
}

describe("requireOperator", () => {
  it("calls notFound() when no user is signed in", async () => {
    const sb = makeClient({ user: null, profile: null });
    await expect(requireOperator(sb)).rejects.toMatchObject({
      digest: expect.stringMatching(/NEXT_(NOT_FOUND|HTTP_ERROR_FALLBACK;404)/),
    });
  });

  it("calls notFound() when the user is not an operator", async () => {
    const sb = makeClient({
      user: { id: "u1", email: "u1@example.com" },
      profile: { is_operator: false },
    });
    await expect(requireOperator(sb)).rejects.toMatchObject({
      digest: expect.stringMatching(/NEXT_(NOT_FOUND|HTTP_ERROR_FALLBACK;404)/),
    });
  });

  it("calls notFound() when the profile query returns no row", async () => {
    const sb = makeClient({
      user: { id: "u1", email: "u1@example.com" },
      profile: null,
    });
    await expect(requireOperator(sb)).rejects.toMatchObject({
      digest: expect.stringMatching(/NEXT_(NOT_FOUND|HTTP_ERROR_FALLBACK;404)/),
    });
  });

  it("returns { userId, email } when the user is an operator", async () => {
    const sb = makeClient({
      user: { id: "u1", email: "ops@example.com" },
      profile: { is_operator: true },
    });
    await expect(requireOperator(sb)).resolves.toEqual({
      userId: "u1",
      email: "ops@example.com",
    });
  });
});
