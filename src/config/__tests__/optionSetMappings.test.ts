import { describe, expect, it } from "vitest";
import { mapOptionCode } from "../optionSetMappings";

describe("mapOptionCode", () => {
  const table = { "1": "with", "0": "without" } as const;

  it("looks up a mapped code", () => {
    expect(mapOptionCode(table, "1")).toBe("with");
    expect(mapOptionCode(table, "0")).toBe("without");
  });

  it("returns undefined for an unmapped code instead of guessing", () => {
    expect(mapOptionCode(table, "9")).toBeUndefined();
  });

  it("returns undefined for null/undefined input", () => {
    expect(mapOptionCode(table, undefined)).toBeUndefined();
    expect(mapOptionCode(table, null)).toBeUndefined();
  });
});
