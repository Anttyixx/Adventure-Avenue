import { execSync } from 'node:child_process';
import sharp from 'sharp';
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

/**
 * Ships every PNG as lossless WebP: the same pixels in a file about 40% smaller, so the game
 * downloads much less. The PNGs in `src/assets` stay as they are (and the dev server uses them);
 * only the built files change. Each image keeps its name with `.webp` in place of `.png`, and
 * every mention of it in the built scripts and styles is changed to match.
 */
function webpImages(): Plugin {
  return {
    name: 'webp-images',
    apply: 'build',
    async generateBundle(_options, bundle) {
      const renamed = new Map<string, string>();
      await Promise.all(
        Object.values(bundle).map(async (file) => {
          if (file.type !== 'asset' || !file.fileName.endsWith('.png')) return;
          const png = Buffer.from(file.source as Uint8Array);
          const webp = await sharp(png).webp({ lossless: true, effort: 6 }).toBuffer();
          // Keep the PNG in the rare case it is already the smaller one.
          if (webp.length >= png.length) return;
          const name = file.fileName.replace(/\.png$/, '.webp');
          renamed.set(file.fileName, name);
          delete bundle[file.fileName];
          this.emitFile({ type: 'asset', fileName: name, source: webp });
        }),
      );
      // File names carry a hash, so swapping the bare name is safe wherever it appears.
      const swap = (text: string) => {
        for (const [from, to] of renamed) {
          const a = from.split('/').pop()!;
          if (text.includes(a)) text = text.split(a).join(to.split('/').pop()!);
        }
        return text;
      };
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk') file.code = swap(file.code);
        else if (file.fileName.endsWith('.css')) file.source = swap(String(file.source));
      }
    },
  };
}

// Relative base so the build works from any GitHub Pages sub-path (/, /dev/, ...).
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  define: { __BUILD__: JSON.stringify(info) },
  plugins: [versionFile(), webpImages()],
});
