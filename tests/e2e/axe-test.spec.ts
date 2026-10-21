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