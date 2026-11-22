import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import rendererPlugin from 'vite-plugin-electron-renderer';
import path from 'node:path';

// Same shape as Krypt Editor: one renderer window (the hub) plus the Electron
// main + preload bundles. The MCP server lives in main; reel preview/render
// runs in the renderer (canvas + WebCodecs via mediabunny).

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            sourcemap: true,
            rollupOptions: {
              // zod ships comments Rollup can't place ("contains an annotation that Rollup cannot interpret"): harmless, not ours.
              onwarn(w, warn) {
                if (w.code === 'INVALID_ANNOTATION' && w.id?.includes('node_modules')) return;
                warn(w);
              },
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: { build: { outDir: 'dist-electron', sourcemap: true } },
      },
    ]),
    rendererPlugin(),
  ],
  resolve: {
    alias: { '@shared': path.resolve(__dirname, 'shared') },
  },
  build: {
    rollupOptions: { input: { main: path.resolve(__dirname, 'index.html') } },
  },
  server: { port: 5191, strictPort: true },
  clearScreen: false,
});
