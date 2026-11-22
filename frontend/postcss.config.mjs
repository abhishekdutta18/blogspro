/**
 * postcss.config.mjs — Tailwind 3 runs as a plain PostCSS plugin through Vite.
 * This replaces the @astrojs/tailwind integration, which only supports Astro up to 5.
 * Base styles stay opt-in: BaseLayout imports src/styles/global.css itself.
 */
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default {
  plugins: [tailwindcss(), autoprefixer()]
};
