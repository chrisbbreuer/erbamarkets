/**
 * **Menu Source Configuration**
 *
 * Where the live inventory comes from.
 *
 * ERBA's menu is run on Jane (iheartjane.com), embedded on the current site
 * under `/menu`. Jane models a *licence*, not a building: the West LA shop is
 * two Jane stores at one address, one recreational and one medical, each with
 * its own product list and prices. So the mapping below is store slug plus
 * licence type to a Jane store id, not one id per location.
 *
 * `./buddy sync:menu` reads this. Nothing else does — the storefront reads the
 * database, so the site keeps serving its last good import if Jane is down.
 */

/** How a location's menu is sourced. */
export interface MenuSource {
  /** `slug` of the Store row this stocks. */
  store: string
  /** Jane's store id, from the `/menu/store/{id}/…` URLs on the live site. */
  janeStoreId: number
  /** Which licence this list is served under. */
  licence: 'recreational' | 'medical'
}

export default {
  /**
   * Jane's Bloom menu is served from the retailer's own domain, so requests
   * look like ordinary page loads. Calling `api.iheartjane.com` directly is
   * blocked by their edge — see the note in `app/Commands/SyncMenu.ts`.
   */
  baseUrl: 'https://www.erbamarkets.com/menu',

  /**
   * Recreational only, deliberately.
   *
   * The medical list (store 2289) is the same 649 products at the same address;
   * it differs in tax treatment and in requiring a state MMIC at checkout,
   * neither of which this storefront handles yet. Importing it would double
   * every row for no visible difference. Add it here once medical checkout
   * exists.
   */
  sources: [
    { store: 'erba-west-la', janeStoreId: 2219, licence: 'recreational' },
  ] satisfies MenuSource[],

  /**
   * Sawtelle has no Jane store.
   *
   * It trades — the shop is open, the licence is current — but it has never
   * been set up for online ordering, and the current site's "ORDER ONLINE"
   * button on the Sawtelle page leads to a picker that only offers West LA.
   * Listing it here keeps that visible rather than letting it read as an
   * oversight, and `sync:menu` reports it on every run.
   *
   * Remove a slug from this list the moment its Jane store exists, and add the
   * matching entry to `sources`.
   */
  withoutOnlineMenu: ['erba-sawtelle'],

  /**
   * Seconds between requests while importing.
   *
   * The import is a few hundred page loads against the client's own site. It
   * runs nightly and nothing waits on it, so it goes slowly on purpose.
   */
  requestDelay: 0.25,
}
