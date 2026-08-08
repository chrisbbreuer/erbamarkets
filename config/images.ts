import type { ImagesConfig } from '@stacksjs/types'

/**
 * **Images Configuration**
 *
 * The link previews this site declares, built by `buddy generate:images`.
 *
 * A link preview is the only part of a page most people ever see, and the
 * default was the favicon: every share rendered as a small square icon next to
 * a URL and said nothing about the shop. Each page below gets its own card
 * with its own headline, so a link to the menu previews as the menu and a link
 * to the specials previews as the specials.
 *
 * One card per page at 1200x630, and only that one is declared as `og:image`.
 * Publishing a square and a portrait crop alongside it does not give consumers
 * a shape to choose from: Discord lays every declared image out side by side,
 * each cropped to a sliver, and Facebook and Apple take the first and ignore
 * the rest.
 */
export default {
  // Geist, the same face the site sets its type in, shipped as TTF because
  // that is the outline format the generator reads. WOFF2 and OpenType/CFF are
  // different formats and will not load.
  fonts: {
    title: 'resources/fonts/Geist-Bold.ttf',
    body: 'resources/fonts/Geist-Regular.ttf',
  },

  // The dark room, in the brand's own colours. Positions are fractions of the
  // canvas, so one definition renders correctly at every size.
  background: {
    color: '#0b0d0c',
    gradient: {
      angle: 165,
      stops: [
        { offset: 0, color: '#0b0d0c' },
        { offset: 1, color: '#131614' },
      ],
    },
    glows: [{ x: 0.82, y: 0.1, radius: 0.6, color: '#a8d84a30' }],
  },
  color: '#f3f2ed',
  mutedColor: '#9ba09a',
  accent: '#a8d84a',

  /*
   * The real ERBA lockup carries the card, in place of the brand set in type.
   * It is white artwork, which is right here: every card is drawn on the dark
   * room background.
   */
  brand: 'ERBA Markets',

  social: {
    enabled: true,
    outputDir: 'public/social',
    publicPath: '/social',
    presets: ['og'],
    format: 'jpeg',
    quality: 88,

    // The generators read these from the social block, not the top level.
    accent: '#a8d84a',
    /*
     * No mark on the cards yet. The ERBA lockup is 2:1, and ts-images reserves
     * a SQUARE slot for the mark beside the brand text: widening the mark to
     * its own proportions (stacks 0.70.316) makes it overrun that text rather
     * than replacing it. Putting the logo on the card properly needs the card
     * layout to know the mark's width, which is a change in ts-images itself.
     */
    /*
     * The real lockup carries the card, in place of the brand set in type.
     * The row reserves the mark's true width (ts-images 0.2.8), so the 2:1
     * wordmark is neither shrunk into a square nor run over the text beside
     * it, and standing alone it takes the room that text would have used.
     *
     * No plate: the artwork is white and every card is drawn on the dark room
     * background, so a white plate behind it would hide it.
     */
    brand: '',
    mark: 'public/images/erba-logo.png',
    markPlate: false,
    color: '#f3f2ed',
    mutedColor: '#9ba09a',

    pages: [
      {
        path: '/',
        title: 'The premier cannabis destination in Los Angeles',
        eyebrow: 'West Los Angeles',
        subtitle: 'Two West LA dispensaries, free delivery over $30, and curbside pickup.',
      },
      {
        path: '/menu',
        title: 'Everything on the shelf today',
        eyebrow: 'The full menu',
        subtitle: 'Flower, pre-rolls, cartridges, edibles and concentrates, priced as you see them.',
      },
      {
        path: '/specials',
        title: 'A reason to come in, seven days a week',
        eyebrow: 'Weekly specials',
        subtitle: 'A deal every day, from Tank Tuesday to Fresh Fruit Cup Friday.',
      },
      {
        path: '/login',
        title: 'Staff sign in',
        eyebrow: 'ERBA staff',
        subtitle: 'Dispatch and driver tools.',
      },
    ],
  },
} satisfies ImagesConfig
