// Performance baseline (docs/plans/parallel-work-plan-2026-11-12.md §8).
// Lab numbers from one unthrottled desktop load each: a floor to notice
// regressions against, not proof of real-user Core Web Vitals. INP needs real
// interaction data and is not measured here. Run with `npm run e2e:perf`, which
// uses a production build; dev-server numbers are meaningless.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { anonymous, as, expect, FIXTURES, test } from "../fixtures.ts";
import { ROOT } from "../support/env.ts";

const BUDGET = { lcpMs: 2500, cls: 0.1 };

interface Sample { route: string; lcpMs: number; cls: number; ttfbMs: number; jsKb: number }
const samples: Sample[] = [];

async function measure(page: import("@playwright/test").Page, label: string, url: string) {
  await page.addInitScript(() => {
    const w = window as unknown as { __lcp: number; __cls: number };
    w.__lcp = 0;
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!e.hadRecentInput) w.__cls += e.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500); // let late content settle so shifts are counted
  const sample = await page.evaluate((route) => {
    const w = window as unknown as { __lcp: number; __cls: number };
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const js = (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
      .filter((r) => r.name.endsWith(".js") || r.initiatorType === "script")
      .reduce((sum, r) => sum + (r.transferSize || r.encodedBodySize || 0), 0);
    return {
      route,
      lcpMs: Math.round(w.__lcp),
      cls: Math.round(w.__cls * 1000) / 1000,
      ttfbMs: Math.round(nav.responseStart),
      jsKb: Math.round(js / 1024),
    };
  }, label);
  samples.push(sample);
  test.info().annotations.push({ type: "perf", description: JSON.stringify(sample) });
  expect.soft(sample.lcpMs, `${label} LCP`).toBeLessThanOrEqual(BUDGET.lcpMs);
  expect.soft(sample.cls, `${label} CLS`).toBeLessThanOrEqual(BUDGET.cls);
}

test.describe.configure({ mode: "serial" });
// Only meaningful against `next start`; the local dev server compiles on demand.
test.skip(!process.env.CI, "perf baseline needs a production build: npm run e2e:perf");

test.afterAll(() => {
  const dir = path.join(ROOT, "test-results");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "perf-baseline.json"), JSON.stringify(samples, null, 2));
});

test.describe("signed in", () => {
  test.use(as("super_admin"));
  test("dashboard", { tag: ["@perf"] }, async ({ page }) => measure(page, "/", "/"));
  test("CRM board", { tag: ["@perf"] }, async ({ page }) => measure(page, "/crm", "/crm"));
  test("task board", { tag: ["@perf"] }, async ({ page }) =>
    measure(page, "/tasks/[project]/[board]", `/tasks/${FIXTURES.project.id}/${FIXTURES.miniProject.id}`));
});

test.describe("public", () => {
  test.use(anonymous);
  test("digital card", { tag: ["@perf"] }, async ({ page }) =>
    measure(page, "/c/[token]", `/c/${FIXTURES.publishedCard.token}`));
});
