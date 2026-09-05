import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';

const hasSitesManifest = existsSync(
  new URL('./.openai/hosting.json', import.meta.url),
);
export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: { dedupe: ['react', 'react-dom', 'three'] },
  optimizeDeps: {
    include: [
      'three',
      'three/examples/jsm/lines/Line2.js',
      'three/examples/jsm/lines/LineGeometry.js',
      'three/examples/jsm/lines/LineMaterial.js',
      '@dimforge/rapier3d-compat',
      'recharts',
      '@base-ui/react/input',
    ],
  },
  server: {
    host: '127.0.0.1',
    watch: { useFsEvents: false, usePolling: true },
  },
  plugins: [vinext(), ...(hasSitesManifest ? [sites()] : [])],
});
