import { expect, test } from "@playwright/test";

test("the original physical voice demo starts and its modes remain available", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.getByText("Chimera", { exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Sing" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "Play" }).click();
  await page.getByRole("button", { name: "Breathe in and start" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__chimeraEngine?.latest?.t?.outRms ?? 0), { timeout: 10_000 }).toBeGreaterThan(.001);
  await page.getByRole("radio", { name: "Speak" }).click();
  await page.getByLabel("Text to speak").fill("Hello, can you hear me?");
  await page.getByRole("button", { name: "Speak", exact: true }).click();
  await expect(page.locator(".transcription")).not.toHaveText("The transcription appears here.", { timeout: 15_000 });
  await page.getByRole("radio", { name: "Bestiary" }).click();
  await expect(page.locator(".specimen")).toHaveCount(4);
  await expect(page.getByText("Songbird", { exact: true })).toBeVisible();
  await page.locator(".call").first().click();
  await expect.poll(() => page.evaluate(() => (window as any).__chimeraEngine?.latestCreature?.t?.outRms ?? 0), { timeout: 10_000 }).toBeGreaterThan(.00001);
  await page.getByRole("radio", { name: "Beatbox" }).click();
  await expect(page.getByRole("button", { name: "Play beat" })).toBeVisible();
  await page.getByRole("radio", { name: "Sing" }).click();
  await expect(page.getByLabel("Lyrics to sing")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the original demo works at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await expect(page.getByRole("radio", { name: "Sing" })).toBeVisible();
  await page.getByRole("radio", { name: "Bestiary" }).click();
  await expect(page.locator(".specimen")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
