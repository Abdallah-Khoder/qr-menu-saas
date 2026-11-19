import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }, // same "@/" the app uses, so tests can load the routes
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
