import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testIgnore: '**/unit/**',
  use: { browserName: 'chromium', trace: 'retain-on-failure' },
})
