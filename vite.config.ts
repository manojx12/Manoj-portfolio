import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2020',
    // The 3D chunk (three.js + world) is ~146 KB gzipped and is loaded lazily, after the HTML is
    // already readable, and never in plain view. The default 500 KB warning doesn't apply to it.
    chunkSizeWarningLimit: 600,
  },
});
