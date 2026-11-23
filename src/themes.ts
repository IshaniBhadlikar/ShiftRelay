/**
 * Theme catalog.
 *
 * ShiftRelay uses `relay` (src/themes.css). `slate` is the scaffold's dark
 * default from the styles.css @theme block, kept only as the base layer.
 * To add another theme:
 *   1. Add a `[data-theme="my-id"] { ... }` block in src/themes.css with
 *      the shadcn token overrides (include `color-scheme: light;` for
 *      light themes).
 *   2. Add an entry here for type safety, autocomplete, and UI display.
 *   3. Add the theme's background to the first-paint <style> block in
 *      index.html so the pre-CSS frame matches (no white flash).
 *   4. Switch via `data-theme` on <html> in index.html.
 *
 * Color values live in styles.css / themes.css — this file is metadata only.
 */

export const THEMES = [
  {
    id: 'relay',
    label: 'Relay',
    description: 'ShiftRelay: warm paper, graphite ink, deep-green stamp accent.',
  },
  {
    id: 'slate',
    label: 'Slate',
    description: 'Scaffold dark default (styles.css @theme). Not used by ShiftRelay.',
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

/** Read the currently active theme id from <html data-theme>. */
export function getActiveTheme(): ThemeId {
  if (typeof document === 'undefined') return 'relay'
  const id = document.documentElement.getAttribute('data-theme') as ThemeId | null
  return id ?? 'relay'
}

/** Look up a theme entry by id, or fall back to the first theme. */
export function getTheme(id: string) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
