import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import type { Result } from 'axe-core';

test('should have no serious or critical axe violations', async ({ page }, testInfo) => {
  await page.goto('/');
  // Wait for the app to load (e.g., wait for the heading)
  await page.waitForSelector('h1');
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter(
    (v: Result) => v.impact === 'serious' || v.impact === 'critical'
  );
  expect(seriousOrCritical).toEqual([]);
});