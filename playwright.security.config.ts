import { defineConfig } from '@playwright/test';
import pwaConfig from './playwright.pwa.config';

export default defineConfig(pwaConfig, {
  testMatch: ['pwa-production.spec.ts', 'security-headers.spec.ts'],
  outputDir: 'test-results/security-headers',
});
