import type { Locator, Page } from "@playwright/test";

/**
 * Drag for @dnd-kit's PointerSensor: press, move past its activation distance
 * in steps, then drop. Playwright's dragTo() is too quick for the sensor.
 */
export async function dragTo(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("dragTo: source or target is not visible");
  const sx = from.x + from.width / 2;
  const sy = from.y + from.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 10, sy + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + Math.min(to.height / 2, 40), { steps: 15 });
  await page.mouse.up();
}
