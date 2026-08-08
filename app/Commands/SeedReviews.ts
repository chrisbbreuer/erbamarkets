import type { CLI } from '@stacksjs/types'
import process from 'node:process'
import { log } from '@stacksjs/cli'
import { ExitCode } from '@stacksjs/types'
// Models are auto-imported as server globals in routes, actions and jobs, but
// not in a buddy command, so they are imported the way the framework's own
// code does it.
import Product from '../Models/Product'
import Category from '../../storage/framework/defaults/app/Models/commerce/Category'
import Customer from '../../storage/framework/defaults/app/Models/commerce/Customer'
import Review from '../../storage/framework/defaults/app/Models/commerce/Review'

/**
 * Fills the menu with reviews.
 *
 * `./buddy seed` generates rows from a model's factory, which produces lorem
 * ipsum against random product ids. That is fine for load testing and useless
 * for looking at: you cannot tell whether a review list reads well when every
 * review says "Dolorem ipsam quia."
 *
 * So the copy here is written, keyed to the kind of product it hangs off - a
 * cartridge review talks about draw and battery, a gummy review talks about
 * onset - and the spread is deliberate rather than uniform. Some products are
 * loved, one is divisive, one is nearly new with two reviews.
 *
 * Every review is one of three shapes, because all three are legal:
 *
 *   - stars only, which is what a one-tap prompt produces
 *   - a comment with no stars, from someone who wants to say a thing rather
 *     than score it
 *   - both
 *
 * Re-running is safe. Reviews are keyed on the pair (product, customer), so a
 * second run updates rather than duplicates, and the cached rating on each
 * product is recomputed at the end either way.
 */

interface SeedOptions {
  fresh?: boolean
}

/** The people leaving them. Names only; nothing here is a real customer. */
const REVIEWERS = [
  'Marisol Vega', 'Andre Whitfield', 'Priya Raman', 'Tobias Lang', 'Nia Okafor',
  'Danny Escobar', 'Rachel Kim', 'Curtis Boyd', 'Amara Diallo', 'Jonah Feldman',
  'Sofia Marchetti', 'Wes Tanaka', 'Bianca Ortiz', 'Elliot Shaw', 'Keisha Bell',
  'Ravi Chandra', '太一 Nakamura', 'Lena Petrova', 'Marcus Doyle', 'Yusuf Haddad',
  'Camille Rousseau', 'Devon Pryce', 'Ingrid Solberg', 'Hector Salas', 'Fiona Cheng',
]

/**
 * Review copy by category, so a gummy review never talks about a battery.
 *
 * Each entry is [rating, title, body]. A null rating is a comment with no
 * stars; an empty body with a rating is the stars-only shape. Ratings skew
 * high, as real dispensary reviews do, with enough dissent to make the
 * distribution bars worth rendering.
 */
type Copy = [number | null, string, string]

const COPY: Record<string, Copy[]> = {
  'flower': [
    [5, 'Best jar I have had this year', 'Dense, sticky, and the smell hits you before the lid is off. Burned clean down to white ash. I have paid twice this for worse.'],
    [5, '', ''],
    [4, 'Very good, slightly dry', 'Effects are exactly what the label says. Mine was a touch dry on the second half of the jar, which is the only reason this is not a five.'],
    [null, 'Ask for it by name', 'Budtender put me onto this after I said I wanted something for the evening without being flattened. He was right. No score from me, I am new to this.'],
    [5, 'Consistent', 'Third time buying. Same quality every time, which is more than I can say for most.'],
    [3, 'Fine, not remarkable', 'Perfectly decent smoke. Nothing about it stood out at the price.'],
    [4, '', ''],
    [5, 'The trim job', 'Somebody actually took their time with this. Hand trimmed and it shows.'],
    [2, 'Not for me', 'Far too heavy. I could not do anything for the rest of the evening. Probably my fault for not asking.'],
    [null, '', 'Bought this for my father who has trouble sleeping. He has not stopped talking about it.'],
  ],
  'cartridges': [
    [5, 'Draws beautifully', 'No clogging, no burnt taste even at the end. Flavour holds all the way through, which is rare.'],
    [4, 'Good, goes fast', 'Really enjoyable. My only note is that it disappears quicker than I expected.'],
    [5, '', ''],
    [null, 'Works with my battery', 'Just here to say this fit and worked fine with an older 510 battery, since I could not find that written anywhere.'],
    [5, 'Flavour is the whole point', 'You can actually taste the strain rather than generic sweetness. Worth the extra.'],
    [3, 'Leaked a little', 'Performance was good but mine wept a bit around the mouthpiece on a warm day. Staff sorted me out.'],
    [4, '', ''],
    [5, 'Discreet', 'No smell, fits in a pocket, does the job. Exactly what I wanted.'],
    [null, '', 'Second one of these. Nothing more to add, it just works.'],
  ],
  'edibles': [
    [5, 'Onset is predictable', 'About forty minutes, every time. That consistency is worth more to me than potency.'],
    [4, 'Tastes like the fruit, not the plant', 'Genuinely pleasant. Slight aftertaste but nothing you would complain about.'],
    [null, 'Start with half', 'Not scoring this because it did its job and the mistake was mine. Take half and wait an hour before you decide anything.'],
    [5, '', ''],
    [5, 'Sleep', 'I have tried a lot of these. This is the only one I have kept buying.'],
    [3, 'Dosing is a bit strong for me', 'Good product, I just wish it came in a lower dose. Cutting them in half works.'],
    [4, '', ''],
    [2, 'Did very little', 'Honestly felt almost nothing from two of them. Might be my tolerance.'],
    [5, 'Great for a first try', 'Bought these for a friend who had never had one. Gentle and easy to dose.'],
  ],
  'pre-rolls': [
    [4, 'Rolled properly', 'Even burn, no canoeing, no runs. Whoever packs these knows what they are doing.'],
    [5, '', ''],
    [5, 'Convenience without the compromise', 'I expected shake. This is not shake.'],
    [null, 'Good for sharing', 'Took a pack to a friend and it was the right call. No rating because I did not smoke much of it.'],
    [3, 'One of the two was tight', 'First one drew hard, second was perfect. A bit of a lottery.'],
    [4, '', ''],
    [5, 'My default now', 'Grab a pack every time I come in.'],
  ],
  'concentrates': [
    [5, 'Terpene forward', 'The nose on this is unbelievable. Melts properly, no chasing it round the banger.'],
    [5, '', ''],
    [4, 'Excellent, pricey', 'No complaints about the product at all. It is simply expensive, which I knew going in.'],
    [null, 'Storage tip', 'Keep it cold. Mine went soft on the drive home in August and it was harder to work with. Not the product’s fault, so no score.'],
    [5, 'Cold cure is worth it', 'If you have only had distillate, this will reset what you think this stuff tastes like.'],
    [4, '', ''],
    [3, 'Good but I preferred the last batch', 'Still solid. The previous run had more of the gassy note I was after.'],
  ],
  'wellness': [
    [5, 'It actually helps', 'Using this on a shoulder that has bothered me for years. Not a miracle, but a real difference and no head effect at all.'],
    [null, 'For anyone nervous about this category', 'I do not smoke and had never set foot in a dispensary. Nobody made me feel odd for asking basic questions. Leaving no rating because I have nothing to compare it to.'],
    [5, '', ''],
    [4, 'Absorbs well, mild smell', 'Not greasy, which was my worry. Faint herbal smell that fades.'],
    [5, 'Repeat purchase', 'Fourth tub. That is the whole review.'],
    [4, '', ''],
    [null, '', 'My mother uses this for her hands. She asked me to come back for two more.'],
  ],
}

/**
 * How many reviews each product gets, and how forgiving its reviewers are.
 *
 * Uniform counts look generated. A real menu has a couple of products
 * everybody has an opinion about and several nobody has got to yet, so the
 * multiplier varies per product and two are deliberately left thin.
 */
const VOLUME: Record<string, number> = {
  'blue-flame-og': 10,
  'pink-lotus': 9,
  'magic-melon-pod': 8,
  'midnight-blueberry-gummies': 9,
  'wedding-cake-pre-roll-2-pack': 7,
  'cold-cured-live-rosin-badder': 7,
  'releaf-balm': 7,
  'purple-carbonite': 6,
  'sour-diesel-smalls': 5,
  'pineapple-express-pod': 5,
  'watermelon-lemonade-gummies': 5,
  'papaya-live-resin-sauce': 4,
  'orange-sunset-pod': 4,
  'growers-collection-sativa-6-pack': 4,
  'strawberry-cough-cartridge': 3,
  'marionberry-indica-gummies': 3,
  'cbd-protab-10-pack': 3,
  'blue-dream-live-rosin-cart': 3,
  // Two that only just landed, so the empty and nearly-empty states are real.
  'pink-lemonade-live-resin-chews': 2,
  'sunset-sherbert-infused-pre-roll': 0,
}

/**
 * A deterministic shuffle.
 *
 * Seeded per product so a re-run produces the same menu, and so two products
 * in the same category do not end up with their reviews in identical order.
 */
function pick<T>(items: T[], count: number, seed: number): T[] {
  const ordered = items.slice()

  for (let i = ordered.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    const j = seed % (i + 1)
    ;[ordered[i], ordered[j]] = [ordered[j]!, ordered[i]!]
  }

  return ordered.slice(0, count)
}

/** Days back from today, so the list has a plausible spread of dates. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

export default function (buddy: CLI): void {
  buddy
    .command('seed:reviews', 'Fill the menu with written customer reviews')
    .option('--fresh', 'Delete every existing review first', { default: false })
    .action(async (options: SeedOptions) => {
      try {
        const products = await Product.query().get()

        if (products.length === 0) {
          log.error('No products. Run `./buddy seed:catalog` first.')
          process.exit(ExitCode.FatalError)
        }

        if (options.fresh) {
          const existing = await Review.query().get()
          for (const review of existing)
            await Review.where('id', review.id).delete()

          log.info(`Removed ${existing.length} existing reviews`)
        }

        // Reviewers first: a review belongs to a customer, and reusing one
        // pool across products means the same names recur, the way they do on
        // a real menu.
        const customerIds: number[] = []
        for (const [index, name] of REVIEWERS.entries()) {
          /*
           * Derived from the name where the name is ASCII, and from the index
           * where it is not. Real customer names are not all Latin script -
           * one of the seeded reviewers is not - and naively stripping
           * everything outside [a-z] left `.nakamura@example.com`, which fails
           * validation on the leading dot. Keeping the name and falling back
           * on the local part is the right way round: the review list has to
           * render that name correctly either way.
           */
          const local = name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.+|\.+$/g, '')
          const email = `${local || `reviewer.${index + 1}`}@example.com`
          const existing = await Customer.where('email', email).first()

          if (existing) {
            customerIds.push(existing.id)
            continue
          }

          const created = await Customer.create({
            name,
            email,
            phone: `310-555-${String(1000 + index).slice(-4)}`,
            status: 'Active',
            totalSpent: 0,
            // Required by the model, and never rendered: the review list shows
            // a name, not a face. Pointed at our own mark rather than an
            // avatar service so seeding needs no network and no third party
            // learns the address of every seeded customer.
            avatar: 'https://www.erbamarkets.com/images/erba-mark.png',
          })

          customerIds.push(created.id)
        }

        log.success(`Reviewers: ${customerIds.length}`)

        // Slug to category, so each product draws from the right copy.
        const categoryRows = await Category.query().get()
        const categoryById = new Map(categoryRows.map((row: any) => [row.id, row.slug]))

        let written = 0
        let starsOnly = 0
        let commentsOnly = 0
        let both = 0

        for (const [index, product] of products.entries()) {
          const wanted = VOLUME[product.slug] ?? 4
          if (wanted === 0)
            continue

          const category = categoryById.get(product.category_id) ?? 'flower'
          const pool = COPY[category] ?? COPY.flower!
          const chosen = pick(pool, Math.min(wanted, pool.length), index + 1)

          for (const [position, [rating, title, content]] of chosen.entries()) {
            const customerId = customerIds[(index * 7 + position * 3) % customerIds.length]!

            const hasRating = rating !== null
            const hasWords = Boolean(title || content)

            if (hasRating && hasWords) both++
            else if (hasRating) starsOnly++
            else commentsOnly++

            // Spread over the past year, newest first, so "most recent" is a
            // meaningful sort rather than insertion order.
            const age = position * 11 + (index % 5) * 3 + 2

            const row = {
              productId: product.id,
              customerId,
              rating,
              title,
              content,
              isVerifiedPurchase: position % 5 !== 3,
              // One in nine is left pending, so the moderation queue is not
              // empty and the approved-only filter has something to exclude.
              isApproved: (index + position) % 9 !== 0,
              isFeatured: position === 0 && wanted >= 7,
              helpfulVotes: Math.max(0, 24 - position * 3 + (index % 4)),
              unhelpfulVotes: position % 6,
              purchaseDate: daysAgo(age + 3),
              createdAt: daysAgo(age),
              images: '',
            }

            // Keyed on the pair, so a re-run edits rather than duplicates.
            const existing = await Review.where('product_id', product.id)
              .where('customer_id', customerId)
              .first()

            if (existing)
              await Review.where('id', existing.id).update(row)
            else
              await Review.create(row)

            written++
          }
        }

        log.success(`Reviews: ${written} (${both} rated and written, ${starsOnly} stars only, ${commentsOnly} comment only)`)

        // The cached columns on `products`. A menu sorted by rating cannot
        // join and aggregate per row, so the answer has to already be there.
        // Only approved reviews count, and only rated ones move the average -
        // an unrated review would otherwise drag it down as if it were a zero.
        let rated = 0
        for (const product of products) {
          const reviews = await Review.where('product_id', product.id)
            .where('is_approved', true)
            .get()

          const ratings = reviews
            .map((review: any) => review.rating)
            .filter((value: unknown): value is number => value !== null && value !== undefined)

          const average = ratings.length
            ? Math.round((ratings.reduce((sum: number, value: number) => sum + value, 0) / ratings.length) * 10) / 10
            : 0

          await Product.where('id', product.id).update({
            rating: average,
            reviewCount: reviews.length,
          })

          if (reviews.length)
            rated++
        }

        log.success(`Rating cache refreshed on ${rated} products`)
        log.info('Run `./buddy dev` and open a product page.')
      }
      catch (error) {
        log.error('Could not seed reviews')
        console.error(error)
        process.exit(ExitCode.FatalError)
      }

      process.exit(ExitCode.Success)
    })
}
