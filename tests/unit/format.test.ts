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

  it("renders dashes for NaN", () => {
    expect(peso(NaN)).toBe("—");
    expect(pesoRound(NaN)).toBe("—");
    expect(formatValue("currency", NaN)).toBe("—");
    expect(formatValue("percentage", NaN)).toBe("—");
    expect(formatValue("number", NaN)).toBe("—");
  });

  it("renders dashes for Infinity and -Infinity", () => {
    expect(peso(Infinity)).toBe("—");
    expect(pesoRound(-Infinity)).toBe("—");
    expect(formatValue("percentage", Infinity)).toBe("—");
    expect(formatValue("ratio", -Infinity)).toBe("—");
    expect(formatValue("months", Infinity)).toBe("—");
  });

  it("handles negative currency with locale sign placement", () => {
    expect(pesoRound(-5000)).toBe("-₱5,000");
    expect(peso(-1234.5, 0)).toBe("₱-1,235");
  });

  it("handles zero values", () => {
    expect(peso(0)).toBe("₱0.00");
    expect(pesoRound(0)).toBe("₱0");
    expect(formatValue("percentage", 0)).toBe("0%");
    expect(formatValue("ratio", 0)).toBe("0.0×");
    expect(formatValue("number", 0)).toBe("0");
  });

  it("percentage and number locale formatting", () => {
    expect(formatValue("percentage", 1050.5)).toBe("1,050.5%");
    expect(formatValue("number", 1234567.8)).toBe("1,234,567.8");
  });
});

