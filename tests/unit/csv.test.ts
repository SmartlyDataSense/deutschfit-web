import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("renders a header row when given empty data", () => {
    expect(toCsv([], ["a", "b"])).toBe("a,b");
  });

  it("escapes commas and double quotes", () => {
    const out = toCsv([{ a: "x,y", b: 'he said "hi"' }], ["a", "b"]);
    expect(out).toContain('"x,y"');
    expect(out).toContain('"he said ""hi"""');
  });

  it("renders nullish cells as empty strings", () => {
    const out = toCsv([{ a: null as string | null, b: undefined as string | undefined }], [
      "a",
      "b",
    ]);
    // Header line + one data line "" (no quoting needed for empty)
    expect(out.split("\n")).toEqual(["a,b", ","]);
  });

  it("preserves numbers and booleans via String() coercion", () => {
    const out = toCsv([{ a: 42, b: true }], ["a", "b"]);
    expect(out).toContain("42,true");
  });

  it("quotes cells containing newlines or carriage returns", () => {
    const out = toCsv([{ a: "line1\nline2", b: "rcr\r" }], ["a", "b"]);
    expect(out).toContain('"line1\nline2"');
    expect(out).toContain('"rcr\r"');
  });
});
