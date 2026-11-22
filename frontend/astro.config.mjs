import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://blogspro.in',
  output: 'static',
  build: {
    format: 'file'
  },
  // Astro 7 defaults to 'jsx', which drops whitespace between inline elements
  // ("Markets <span>…</span>" would render run together). Keep the v5 behaviour.
  compressHTML: true
  // Tailwind runs through postcss.config.mjs (the @astrojs/tailwind integration stops at Astro 5).
});
