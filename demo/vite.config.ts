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
      // pdfjs-dist v5 dropped the extension-less entry; map to the .mjs file
      'pdfjs-dist/legacy/build/pdf': path.resolve(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs'),
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
  /**
   * Dev-server proxy — OpenAI blocks direct browser requests (no CORS headers).
   * Routing through the Vite dev server makes the request server-to-server,
   * which bypasses CORS entirely.
   *
   * /llm-proxy/openai  → https://api.openai.com
   * /llm-proxy/ollama  → http://localhost:11434  (overridden per-request via header)
   */
  server: {
    proxy: {
      '/llm-proxy/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/llm-proxy\/openai/, ''),
        configure(proxy) {
          proxy.on('proxyReq', (_proxyReq, req) => {
            console.log(`[LLM Proxy] → OpenAI  ${req.method} ${req.url}`);
          });
          // When the upstream (api.openai.com) is unreachable, http-proxy silently
          // drops the connection → browser sees "Failed to fetch".
          // We catch the error here and write a proper 502 JSON response instead
          // so the OpenAI handler in llm.ts can read `error.message` and surface it.
          proxy.on('error', (err, _req, res) => {
            console.error('[LLM Proxy] upstream error:', err.message);
            if (typeof (res as any).writeHead === 'function') {
              (res as any).writeHead(502, { 'Content-Type': 'application/json' });
              (res as any).end(
                JSON.stringify({
                  error: {
                    message: `OpenAI proxy error — cannot reach api.openai.com. ${err.message}`,
                  },
                }),
              );
            }
          });
        },
      },
    },
  },
});
