import { describe, expect, it } from "vitest";
import { formatValue, peso, pesoRound } from "@/lib/format";

describe("format helpers", () => {
  it("renders dashes for null/undefined", () => {
    expect(formatValue("ratio", null)).toBe("—");
    expect(formatValue("months", undefined)).toBe("—");
    expect(peso(null)).toBe("—");
    expect(pesoRound(undefined)).toBe("—");
  });

  it("formats numbers safely", () => {
    expect(formatValue("ratio", 1.25)).toBe("1.3×");
    expect(formatValue("months", 2)).toBe("2.0 mo");
    expect(peso(1234.5, 2)).toBe("₱1,234.50");
    expect(pesoRound(1234.5)).toBe("₱1,235");
  });
});

