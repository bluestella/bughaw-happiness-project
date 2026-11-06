import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { ROOT } from "./env.ts";

type Known = { route: string; ruleId: string; issue: number };
const known: Known[] = JSON.parse(
  readFileSync(path.join(ROOT, "tests/e2e/a11y/known-violations.json"), "utf8")
).violations;

/** axe scan; violations not in the baseline file fail the test. */
export async function expectNoNewA11yViolations(page: Page, route: string, testInfo: TestInfo) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const isKnown = (id: string) => known.some((k) => k.route === route && k.ruleId === id);
  const fresh = results.violations.filter((v) => !isKnown(v.id));
  const baselined = results.violations.filter((v) => isKnown(v.id));
  if (baselined.length) {
    testInfo.annotations.push({
      type: "known-a11y",
      description: baselined.map((v) => v.id).join(", "),
    });
  }
  expect(
    fresh.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(" ")) })),
    `New accessibility violations on ${route}`
  ).toEqual([]);
}
