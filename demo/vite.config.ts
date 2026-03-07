import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Optional deps in react-native-pageindex (mammoth, xlsx, pdfjs-dist) are
 * dynamically imported at runtime and are NOT available in the browser bundle.
 * This plugin intercepts their resolution in BOTH dev and build modes and
 * redirects them to a tiny virtual stub so Vite never tries to bundle them.
 */
// mammoth and xlsx are not installed in the demo; pdfjs-dist IS installed (used for PDF upload)
const OPTIONAL_DEPS = ['mammoth', 'xlsx'];
const VIRTUAL_PREFIX = '\0virtual:optional-stub:';

function optionalDepsStubPlugin(): Plugin {
  return {
    name: 'optional-deps-stub',
    enforce: 'pre',
    resolveId(id) {
      if (OPTIONAL_DEPS.includes(id)) {
        // Return a virtual module ID so Vite skips node_modules resolution
        return VIRTUAL_PREFIX + id;
      }
    },
    load(id) {
      if (id.startsWith(VIRTUAL_PREFIX)) {
        const name = id.slice(VIRTUAL_PREFIX.length);
        // Throw a helpful error at runtime if the optional dep is actually called
        return `
export default null;
if (typeof window !== 'undefined') {
  console.warn('[react-native-pageindex] Optional dependency "${name}" is not installed. ' +
    'This format is not available in the browser demo. Install it if needed.');
}
`;
      }
    },
  };
}

export default defineConfig({
  plugins: [
    optionalDepsStubPlugin(),
    react(),
  ],
  resolve: {
    alias: {
      // Point "react-native-pageindex" at the local TypeScript source
      'react-native-pageindex': path.resolve(__dirname, '../src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['react-native-pageindex'],
  },
  build: {
    rollupOptions: {
      // Only exclude deps that are NOT installed in demo/node_modules
      external: OPTIONAL_DEPS,
    },
  },
});
