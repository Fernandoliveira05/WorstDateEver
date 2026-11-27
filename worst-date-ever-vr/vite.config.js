import { defineConfig } from 'vite';

// Relative asset URLs keep dist/ portable when it is served from a subpath
// instead of the domain root.
export default defineConfig({
  base: './',
  server: {
    allowedHosts: ['canon-neuter-venture.ngrok-free.dev', '.trycloudflare.com'],
    proxy: {
      '/v1': { target: 'http://127.0.0.1:8787', ws: true },
      '/health': { target: 'http://127.0.0.1:8787' }
    }
  }
});
