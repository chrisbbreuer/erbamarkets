/**
 * Site-level configuration read by stx.
 *
 * The theme block is the important part. stx ships a pre-paint guard that
 * toggles `.dark` on <html>, persists the choice, re-asserts it on SPA hops,
 * and binds any element with `id="theme-toggle"`. Left unconfigured it does
 * none of that, which is why this file exists at all.
 *
 * An app that writes its own guard ends up with two owners reading different
 * storage keys, and the chosen theme survives a click but loses on the next
 * refresh. So the layout declares only the two palettes and this declares the
 * switch.
 */
export default {
  name: 'ERBA Markets',
  url: 'https://www.erbamarkets.com',

  theme: {
    /**
     * The room is dark, and that is the brand. First visit lands there
     * regardless of the operating system; the toggle is for people who want
     * the other thing, and their choice persists.
     */
    default: 'dark' as const,

    /** App-specific, so a shared host cannot collide with another site's key. */
    storageKey: 'erba-theme',

    /**
     * Browser chrome (the Safari URL bar, Chrome on Android) tints to these.
     * They match --ink in each palette, so the chrome and the page agree.
     */
    colors: {
      light: '#f3f2ed',
      dark: '#0b0d0c',
    },
  },
}
