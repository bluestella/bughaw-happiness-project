import { describe, expect, it } from "vitest";
import { CATEGORICAL, CHART, compactPeso } from "@/lib/chartTheme";

describe("chart palette", () => {
  it("exposes a fixed 4-color categorical order", () => {
    expect(CATEGORICAL).toEqual([CHART.green, CHART.blue, CHART.clay, CHART.plum]);
  });

  it("defines the neutral/grid/ink tokens", () => {
    expect(CHART.neutral).toMatch(/^#/);
    expect(CHART.grid).toMatch(/^#/);
    expect(CHART.axisInk).toMatch(/^#/);
    expect(CHART.ink).toMatch(/^#/);
    expect(CHART.line).toMatch(/^#/);
  });
});

describe("compactPeso", () => {
  it("renders plain pesos under 1,000", () => {
    expect(compactPeso(850)).toBe("₱850");
    expect(compactPeso(0)).toBe("₱0");
  });

  it("renders thousands with a k suffix", () => {
    expect(compactPeso(45000)).toBe("₱45k");
    expect(compactPeso(1000)).toBe("₱1k");
  });

  it("renders millions with an M suffix, trimming a trailing .0", () => {
    expect(compactPeso(2_000_000)).toBe("₱2M");
    expect(compactPeso(1_200_000)).toBe("₱1.2M");
  });

  it("renders a leading minus for negative values", () => {
    expect(compactPeso(-850)).toBe("-₱850");
    expect(compactPeso(-45000)).toBe("-₱45k");
    expect(compactPeso(-2_000_000)).toBe("-₱2M");
  });
});
