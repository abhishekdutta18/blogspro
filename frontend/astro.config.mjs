import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  site: 'https://blogspro.in',
  output: 'static',
  build: {
    format: 'file'
  },
  integrations: [
    tailwind({
      applyBaseStyles: false
    })
  ]
});
