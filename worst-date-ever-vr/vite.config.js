import { defineConfig } from 'vite';

// Relative asset URLs keep dist/ portable when it is served from a subpath
// instead of the domain root.
export default defineConfig({
  base: './'
});
