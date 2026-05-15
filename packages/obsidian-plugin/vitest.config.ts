import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    alias: {
      obsidian: path.resolve(__dirname, './tests/obsidian.ts'),
    },
  },
});
