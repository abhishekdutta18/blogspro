/**
 * Tailwind config — editorial design system.
 * Every colour resolves to a CSS variable defined in src/styles/global.css,
 * so light/dark switching happens in one place (prefers-color-scheme).
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        sunk: 'var(--sunk)',
        ink: {
          DEFAULT: 'var(--ink)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)'
        },
        rule: {
          DEFAULT: 'var(--rule)',
          strong: 'var(--rule-strong)'
        },
        accent: 'var(--accent)',
        up: 'var(--up)',
        down: 'var(--down)'
      },
      fontFamily: {
        serif: ['Newsreader', 'Georgia', 'Cambria', 'serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      maxWidth: {
        measure: '68ch'
      }
    }
  },
  plugins: []
};
