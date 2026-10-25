import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import type { Result } from 'axe-core';

const textFile = (name: string, content: string) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(content) });

test('axe: empty state should have no serious or critical violations', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('h1');
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter(
    (v: Result) => v.impact === 'serious' || v.impact === 'critical'
  );
  expect(seriousOrCritical).toEqual([]);
});

test('axe: after successful conversion should have no serious or critical violations', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose file', { exact: true }).setInputFiles(textFile('happy.txt', 'Hello from M2.'));
  await page.getByRole('textbox', { name: 'Converted output' }).waitFor();
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter(
    (v: Result) => v.impact === 'serious' || v.impact === 'critical'
  );
  expect(seriousOrCritical).toEqual([]);
});

test('axe: chunked output state should have no serious or critical violations', async ({ page }) => {
  await page.goto('/');
  const largeText = 'x'.repeat(15000); // Large enough to trigger chunking
  await page.getByLabel('Choose file', { exact: true }).setInputFiles(textFile('large.txt', largeText));
  await page.getByLabel('Chunk limit', { exact: true }).fill('40');
  await page.getByLabel('Chunk preamble', { exact: true }).check();
  await page.waitForFunction(() => {
    return document.querySelectorAll('.chunk-item').length > 0;
  });
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter(
    (v: Result) => v.impact === 'serious' || v.impact === 'critical'
  );
  expect(seriousOrCritical).toEqual([]);
});

test('axe: error card state should have no serious or critical violations', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose file', { exact: true }).setInputFiles(textFile('broken.bin', '\u0000'));
  await page.getByText(/Unsupported format/).waitFor();
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter(
    (v: Result) => v.impact === 'serious' || v.impact === 'critical'
  );
  expect(seriousOrCritical).toEqual([]);
});

test('axe: options bar state should have no serious or critical violations', async ({ page }) => {
  await page.goto('/');
  // Interact with various options to put them in different states
  await page.getByRole('button', { name: 'Plain', exact: true }).click();
  await page.getByRole('button', { name: 'Combined', exact: true }).click();
  await page.getByLabel('Quick paste', { exact: true }).check();
  await page.getByLabel('Add page markers (PDF)', { exact: true }).check();
  await page.getByLabel('Chunk labels', { exact: true }).uncheck();
  await page.getByLabel('Chunk preamble', { exact: true }).check();
  await page.getByLabel('Chunk unit', { exact: true }).selectOption('tokens');
  await page.getByLabel('Chunk limit', { exact: true }).fill('25');
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter(
    (v: Result) => v.impact === 'serious' || v.impact === 'critical'
  );
  expect(seriousOrCritical).toEqual([]);
});

test('axe: preview-cap notice state should have no serious or critical violations', async ({ page }) => {
  await page.goto('/');
  const hugeText = 'x'.repeat(1_100_000); // Large enough to trigger preview cap
  await page.getByLabel('Choose file', { exact: true }).setInputFiles(textFile('huge.txt', hugeText));
  await page.getByText(/Preview capped at 200,000/).waitFor();
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter(
    (v: Result) => v.impact === 'serious' || v.impact === 'critical'
  );
  expect(seriousOrCritical).toEqual([]);
});

test('axe: light theme mode should have no serious or critical violations', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.waitForSelector('h1');
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter(
    (v: Result) => v.impact === 'serious' || v.impact === 'critical'
  );
  expect(seriousOrCritical).toEqual([]);
});

test('ui-redesign: status chips render both an SVG icon and status text, not color alone', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose file', { exact: true }).setInputFiles(textFile('doc.txt', 'Test content'));
  await page.getByRole('textbox', { name: 'Converted output' }).waitFor();
  const chip = page.locator('.job-status.done');
  await expect(chip).toBeVisible();
  const svg = chip.locator('svg.status-icon');
  await expect(svg).toBeVisible();
  await expect(chip).toHaveText(/done/i);
});

test('ui-redesign: hero dropzone has hero styling, icon, and actions', async ({ page }) => {
  await page.goto('/');
  const heroDropzone = page.locator('.dropzone');
  await expect(heroDropzone).toBeVisible();
  await expect(heroDropzone.locator('.dropzone-hero-icon')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose files' })).toHaveClass(/btn-primary/);
  await expect(page.getByRole('button', { name: 'Choose folder' })).toHaveClass(/btn-secondary/);
});

test('ui-redesign: prefers-reduced-motion guard is applied', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const isReduced = await page.evaluate(() => {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  expect(isReduced).toBe(true);
  const transitionDuration = await page.evaluate(() => {
    const el = document.querySelector('.dropzone');
    return el ? window.getComputedStyle(el).transitionDuration : '';
  });
  expect(parseFloat(transitionDuration)).toBeLessThanOrEqual(0.01);
});

test('ui-redesign: copy button is sticky on mobile viewports', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await page.getByLabel('Choose file', { exact: true }).setInputFiles(textFile('large.txt', 'line\n'.repeat(500)));
  await page.getByRole('textbox', { name: 'Converted output' }).waitFor();
  const copyBtn = page.getByRole('article', { name: 'Conversion output' }).getByRole('button', { name: 'Copy', exact: true });
  await expect(copyBtn).toBeVisible();
  const position = await copyBtn.evaluate((el) => window.getComputedStyle(el).position);
  expect(position).toBe('sticky');
});
