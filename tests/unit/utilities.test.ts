import { describe, expect, it } from "vitest";
import { cn } from "@/lib/cn";
import {
  ALL_CALCULATORS,
  calculatorsByCategory,
  calculatorPath,
  getCalculator,
} from "@/lib/calculators/registry";
import { TOOLS } from "@/lib/tools";
import type { CategoryId } from "@/lib/calculators/types";

describe("cn classname helper", () => {
  it("joins string args", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters out falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("returns empty string for all falsy", () => {
    expect(cn(false, null, undefined)).toBe("");
  });

  it("handles single string", () => {
    expect(cn("only")).toBe("only");
  });

  it("handles no arguments", () => {
    expect(cn()).toBe("");
  });

  it("preserves className with spaces inside individual args", () => {
    expect(cn("a b c", "d e")).toBe("a b c d e");
  });
});

describe("calculator registry lookups", () => {
  it("ALL_CALCULATORS contains unique ids across categories", () => {
    const ids = new Set(ALL_CALCULATORS.map((c) => c.id));
    expect(ids.size).toBe(ALL_CALCULATORS.length);
  });

  it("getCalculator returns the correct calculator by category + id", () => {
    for (const c of ALL_CALCULATORS) {
      const found = getCalculator(c.category, c.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(c.id);
      expect(found!.category).toBe(c.category);
    }
  });

  it("getCalculator returns undefined for unknown paths", () => {
    expect(getCalculator("unit-economics", "nonexistent")).toBeUndefined();
    expect(getCalculator("bogus" as CategoryId, "cogs")).toBeUndefined();
  });

  it("calculatorsByCategory partitions all calculators correctly", () => {
    const categories: CategoryId[] = [
      "unit-economics",
      "go-to-market",
      "product-mgmt",
      "financial",
    ];
    let total = 0;
    for (const cat of categories) {
      const list = calculatorsByCategory(cat);
      total += list.length;
      for (const c of list) {
        expect(c.category).toBe(cat);
      }
    }
    expect(total).toBe(ALL_CALCULATORS.length);
  });

  it("calculatorPath returns expected URL pattern", () => {
    for (const c of ALL_CALCULATORS) {
      const path = calculatorPath(c);
      expect(path).toBe(`/calculators/${c.category}/${c.id}`);
      expect(path.startsWith("/calculators/")).toBe(true);
    }
  });

  it("every calculator declares at least one output and one input field", () => {
    for (const c of ALL_CALCULATORS) {
      expect(c.outputs.length, `${c.id} outputs`).toBeGreaterThan(0);
      const totalFields = c.inputGroups.reduce((n, g) => n + g.fields.length, 0);
      expect(totalFields, `${c.id} input fields`).toBeGreaterThan(0);
    }
  });

  it("every calculator output id matches a key returned by compute()", () => {
    for (const c of ALL_CALCULATORS) {
      const inputs: Record<string, number> = {};
      c.inputGroups.forEach((g) => g.fields.forEach((f) => (inputs[f.id] = f.defaultValue)));
      const outputs = c.compute(inputs);
      for (const o of c.outputs) {
        expect(
          Object.prototype.hasOwnProperty.call(outputs, o.id),
          `${c.id} is missing output key ${o.id}`
        ).toBe(true);
      }
    }
  });
});

describe("tools nav registry", () => {
  it("has a non-empty list of tools", () => {
    expect(TOOLS.length).toBeGreaterThan(0);
  });

  it("every tool has id, name, path, icon fields", () => {
    for (const t of TOOLS) {
      expect(typeof t.id).toBe("string");
      expect(t.id.length).toBeGreaterThan(0);
      expect(typeof t.name).toBe("string");
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.path).toBe("string");
      expect(t.path.startsWith("/")).toBe(true);
      expect(typeof t.icon).toBe("string");
      expect(t.icon.length).toBeGreaterThan(0);
    }
  });

  it("tool ids are unique", () => {
    const ids = TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("tool paths are unique", () => {
    const paths = TOOLS.map((t) => t.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
