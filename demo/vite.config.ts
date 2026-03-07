import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Point "react-native-pageindex" at the local TypeScript source
      'react-native-pageindex': path.resolve(__dirname, '../src/index.ts'),
    },
  },
  optimizeDeps: {
    // Exclude the aliased local package from pre-bundling
    exclude: ['react-native-pageindex'],
  },
  build: {
    rollupOptions: {
      // Optional deps used via dynamic import — not available in browser bundle
      external: ['mammoth', 'xlsx', 'pdfjs-dist', 'pdfjs-dist/legacy/build/pdf'],
    },
  },
  // Silence "module externalized" warnings for optional deps in dev mode
  ssr: {
    noExternal: [],
  },
});
