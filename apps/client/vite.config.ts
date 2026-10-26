import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';

/** Branch, commit and time of this build, shown in the build badge. CI provides the GitHub values. */
function buildInfo() {
  const git = (cmd: string) => {
    try {
      return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
    } catch {
      return '';
    }
  };
  return {
    branch: process.env.GITHUB_REF_NAME || git('git rev-parse --abbrev-ref HEAD') || 'local',
    sha: (process.env.GITHUB_SHA || git('git rev-parse HEAD') || 'unknown').slice(0, 7),
    time: new Date().toISOString(),
  };
}

const info = buildInfo();

/** Writes version.json next to index.html so open pages can tell a newer build was deployed. */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(info) });
    },
  };
}

// Relative base so the build works from any GitHub Pages sub-path (/, /dev/, ...).
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  define: { __BUILD__: JSON.stringify(info) },
  plugins: [versionFile()],
});
