import { readFile } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";

/** Runs `trigger`, waits for the download, checks its name, returns its bytes. */
export async function expectDownload(page: Page, trigger: () => Promise<unknown>, name: RegExp) {
  const [download] = await Promise.all([page.waitForEvent("download"), trigger()]);
  expect(download.suggestedFilename()).toMatch(name);
  const file = await download.path();
  const buffer = await readFile(file);
  return { filename: download.suggestedFilename(), buffer, text: buffer.toString("utf8") };
}
