import { defineConfig } from 'vite';

// Relative base so the build works from any GitHub Pages sub-path (/, /dev/, ...).
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
});
