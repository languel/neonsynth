import { expect, test } from '@playwright/test';

test('examples render and the worklet produces sound', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const original = AudioContext.prototype.createAnalyser;
    AudioContext.prototype.createAnalyser = function () {
      const analyser = original.call(this);
      (window as Window & { testAnalyser?: AnalyserNode }).testAnalyser = analyser;
      return analyser;
    };
  });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Humpback Whale' })).toBeVisible();
  await expect(page.locator('.canvas-part')).toHaveCount(4);
  await page.getByRole('button', { name: 'Hear it' }).click();
  await expect(page.getByText('AUDIO READY')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const analyser = (window as Window & { testAnalyser?: AnalyserNode }).testAnalyser;
    if (!analyser) return 0;
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
  }), { timeout: 2500 }).toBeGreaterThan(.001);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.locator('.library-card')).toHaveCount(8);
  expect(errors).toEqual([]);
});

test('draw, connect, save, import, and compose with a custom instrument', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await page.getByRole('button', { name: 'New instrument', exact: true }).click();
  await page.getByRole('button', { name: 'Draw a part' }).click();
  const box = await page.locator('svg.anatomy-svg').boundingBox();
  expect(box).not.toBeNull();
  const point = (x: number, y: number) => ({ x: box!.x + x * box!.width / 1000, y: box!.y + y * box!.height / 560 });
  await page.mouse.move(point(150, 180).x, point(150, 180).y);
  await page.mouse.down();
  for (const [x, y] of [[230, 150], [300, 190], [285, 260], [210, 290], [145, 245], [150, 180]]) {
    const p = point(x, y); await page.mouse.move(p.x, p.y, { steps: 5 });
  }
  await page.mouse.up();
  await expect(page.locator('.canvas-part')).toHaveCount(1);
  await expect(page.getByLabel('Part name')).toHaveValue('Drawn chamber');
  const initialSize = Number(await page.getByLabel('Chamber size').inputValue());
  await page.getByRole('button', { name: 'Enlarge outline' }).click();
  expect(Number(await page.getByLabel('Chamber size').inputValue())).toBeGreaterThan(initialSize);
  await page.getByLabel('Part name').fill('Moon engine');
  await page.getByLabel('Part type').selectOption('source');
  await page.getByLabel('Energy source', { exact: true }).selectOption('glottis');
  await page.getByRole('button', { name: 'Add part' }).click();
  await page.getByRole('menuitem', { name: 'Sound outlet' }).click();
  await page.getByRole('button', { name: 'Connect parts' }).click();
  await page.getByRole('button', { name: 'Moon engine, Energy source' }).click();
  await page.getByRole('button', { name: 'Sound outlet, Sound outlet' }).click();
  await expect(page.locator('.canvas-count')).toContainText('01 LINKS');
  await page.getByRole('button', { name: 'Save instrument', exact: true }).first().click();
  await page.getByLabel('INSTRUMENT NAME').fill('Moon Beast');
  await page.getByRole('dialog').getByRole('button', { name: 'Save instrument' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('neonsynth.v1.draft') ?? '{}').name)).toBe('Moon Beast');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Moon Beast' })).toBeVisible();
  await expect(page.locator('.canvas-part')).toHaveCount(2);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: /My instruments/ }).click();
  await expect(page.locator('.library-card h3')).toHaveText('Moon Beast');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export Moon Beast' }).click()]);
  const path = await download.path();
  expect(path).not.toBeNull();
  await page.locator('input[type=file]').setInputFiles(path!);
  await expect(page.locator('.library-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Band studio' }).click();
  await page.getByRole('button', { name: 'Add voice' }).click();
  await expect(page.locator('.track-row')).toHaveCount(4);
  await expect(page.getByLabel('Voice 4 instrument').locator('option:checked')).toHaveText('Moon Beast');
  await page.getByLabel('Voice 4 name').fill('Moon solo');
  await page.getByRole('button', { name: 'Moon solo step 1, empty' }).click();
  await expect(page.getByRole('button', { name: 'Moon solo step 1, C4' })).toBeVisible();
  await page.getByLabel('Band name').fill('Moon Parade');
  await page.getByRole('button', { name: 'Save band' }).click();
  await page.getByRole('button', { name: 'Play band' }).click();
  await expect(page.getByRole('button', { name: 'Stop band' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop band' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('neonsynth.v1.bandDraft') ?? '{}').name)).toBe('Moon Parade');
  await page.reload();
  await page.getByRole('button', { name: 'Band studio' }).click();
  await expect(page.getByLabel('Band name')).toHaveValue('Moon Parade');
  await expect(page.getByRole('button', { name: 'Moon solo step 1, C4' })).toBeVisible();
  await page.getByRole('button', { name: /Saved bands/ }).click();
  await expect(page.getByText('Moon Parade', { exact: true })).toBeVisible();
  const [bandDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export current band' }).click()]);
  const bandPath = await bandDownload.path();
  expect(bandPath).not.toBeNull();
  await page.locator('input[type=file]').setInputFiles(bandPath!);
  await page.getByRole('button', { name: /Saved bands/ }).click();
  await expect(page.getByRole('button', { name: 'Moon Parade', exact: true })).toHaveCount(2);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'New empty band' }).click();
  await expect(page.getByLabel('Band name')).toHaveValue('Untitled band');
  await expect(page.locator('.track-row')).toHaveCount(0);
  await page.getByRole('button', { name: /Saved bands/ }).click();
  await page.getByRole('button', { name: 'Moon Parade', exact: true }).first().click();
  await expect(page.locator('.track-row')).toHaveCount(4);
  // A saved band must retain a playable instrument snapshot if its library item is deleted.
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: /My instruments/ }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Moon Beast' }).first().click();
  await page.locator('.example-item').filter({ hasText: 'Humpback Whale' }).click();
  await page.getByRole('button', { name: 'Band studio' }).click();
  await expect(page.getByLabel('Voice 4 instrument').locator('option:checked')).toHaveText('Moon Beast (saved snapshot)');
  expect(errors).toEqual([]);
});

test('mobile navigation fits the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Humpback Whale' })).toBeVisible();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.locator('.library-card')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Band studio' }).click();
  await expect(page.getByRole('heading', { name: 'Better together.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('cycles are rejected and links can be removed', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Connect parts' }).click();
  await page.getByRole('button', { name: 'Resonance chamber, Resonator' }).click();
  await page.getByRole('button', { name: 'Air sac, Energy source' }).click();
  await expect(page.getByRole('status')).toContainText('feedback loop');
  await expect(page.locator('.canvas-count')).toContainText('03 LINKS');
  await page.getByRole('button', { name: 'Select and move' }).click();
  await page.getByRole('button', { name: 'Vocal folds, Energy source' }).click();
  await page.getByRole('button', { name: 'Remove connection to Resonance chamber' }).click();
  await expect(page.locator('.canvas-count')).toContainText('02 LINKS');
  await expect(page.locator('.monitor-bottom')).toContainText('CONNECT A PATH');
});
