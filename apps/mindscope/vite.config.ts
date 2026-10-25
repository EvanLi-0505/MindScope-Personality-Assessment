import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';

// Tauri sets TAURI_ENV_PLATFORM while running beforeDevCommand / beforeBuildCommand.
const isTauri = !!process.env.TAURI_ENV_PLATFORM;

/**
 * Web builds get a strict Content-Security-Policy <meta> tag: the page may only
 * talk to its own origin, so it cannot send data anywhere. (The desktop build
 * gets the equivalent policy from tauri.conf.json.)
 */
function webCsp(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'mindscope-web-csp',
    apply: 'build',
    transformIndexHtml(html) {
      if (isTauri) return html;
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  };
}

export default defineConfig({
  plugins: [vue(), webCsp()],
  clearScreen: false,
  base: './',
  define: {
    __BUILD_TARGET__: JSON.stringify(isTauri ? 'desktop' : 'web'),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
