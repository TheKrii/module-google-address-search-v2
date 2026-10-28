# Vaimo_GoogleAddressSearchV2

Address autocomplete for Magento 2 storefront address forms, built on **Google Places API (New)**.
A rewrite of `Vaimo_GoogleAddressSearch` (V1) with the same purpose (search an address, fill the form)
and a focus on API cost, performance and maintainability.

- Luma: customer address book, checkout shipping and billing addresses, multishipping address forms
- Hyvä: not yet; the core JavaScript is framework-free so a Hyvä adapter can reuse it (see [Hyvä](#hyvä))

## Installation

```bash
composer require vaimo/module-google-address-search-v2
bin/magento module:enable Vaimo_GoogleAddressSearchV2
bin/magento setup:upgrade
```

Then configure **Stores > Configuration > Vaimo Frontend > Google Address Search V2**.

### Google Cloud setup

1. Enable **Maps JavaScript API** and **Places API (New)** in the project. The legacy "Places API" is not used.
2. Create a browser key per environment and restrict it:
   - Application restriction: *Websites*, listing only that environment's storefront domains
   - API restriction: *Maps JavaScript API* and *Places API (New)*
3. Set a daily quota cap on Places API (New) and a billing budget alert.

The key is used by the Maps JavaScript API in the shopper's browser, so it is visible in page source by
design; the restrictions above are what protect it. It is stored encrypted, marked sensitive/environment
specific (excluded from `app:config:dump`), and V2 makes no server-to-Google calls, so no server key exists.

## How it works

```
x-magento-init (init.phtml, ViewModel\AddressSearch)
        │ registers target selectors + config
        ▼
js/bootstrap.js ── one delegated focusin listener per page
        │ first focus on a matching input → attach once per element
        ▼
adapter (dom-form | ui-form) ◄── core/form-filler ◄── core/address-mapper
        ▲                                   ▲
core/search-controller ── core/places-client ── Google Places (New)
        │
core/suggestion-list (ARIA combobox UI)
```

| Piece | Responsibility |
|---|---|
| `Model\Config` | Typed, clamped reads of all settings |
| `Model\Config\Backend\*`, `Model\FieldMapping\RowValidator` | Admin validation (ranges, 15-country limit, place types, mapping rows) |
| `ViewModel\AddressSearch` + `templates/init.phtml` | Frontend config, rendered only when the module is active for the store and form |
| `Plugin\Checkout\MarkAddressSearchFields` | Adds `vaimo-gas-v2` class and form code to street line 0 of checkout address forms |
| `core/places-client.js` | Google loading, session tokens, in-memory cache, error classification |
| `core/search-controller.js` | Min chars, debounce, rate limit, stale-response guard, keyboard |
| `core/suggestion-list.js` | Accessible dropdown (combobox/listbox, live region, attribution) |
| `core/address-mapper.js`, `core/form-filler.js` | Template mapping of address components, field-order rules |
| `adapter/dom-form.js` | Server-rendered forms (`name="street[]"`, `city`...) |
| `adapter/ui-form.js` | Checkout UI components (writes to component observables) |

Instances attach on **first focus**, so pages where nobody touches the address field load nothing from
Google. Re-rendered checkout fields get a fresh instance (tracked in a `WeakMap`); the same element is never
initialised twice. If V1 is enabled for a store view, V2 stays inactive there.

## Cost efficiency

Places API (New) bills Autocomplete requests and Place Details separately. With a session token, the
autocomplete requests of a session that ends in a Place Details call are not billed separately.

| Safeguard | Setting |
|---|---|
| No request below N trimmed characters | Minimum Characters (default 3) |
| One request per typing pause | Debounce Delay (default 300 ms) |
| Hard per-field rate limit | Minimum Interval Between Requests (default off) |
| Out-of-order responses ignored (sequence numbers) | always |
| Same input in a session answered from memory | always (in-memory only, cleared with the session) |
| Input extending a no-result query not sent | Skip Searches After No Results (default yes) |
| One session token per search, ended by the details call or idle timeout | Session Idle Timeout (default 180 s) |
| Details request `addressComponents` only (Essentials tier) | always |
| Edits after a selection (e.g. adding a flat number) don't search again | always |
| Country restriction narrows results | Country Restriction (default: country selected in form) |
| Auth/API-not-enabled errors stop all requests for the page view | always |
| Quota errors back off 30 s → 10 min | always |

**Caching policy:** results are kept only in page memory for the active session and dropped when it ends.
Nothing from Google is persisted (no localStorage, no server cache), in line with the Google Maps Platform
terms, which only allow storing place IDs.

## Field mapping

Admin → *Field Population and Mapping → Field Mapping*. One row per target; the most specific matching row
wins (form + country > form > country > all).

| Column | Example | Notes |
|---|---|---|
| Form | Checkout Shipping Address | Empty = all forms |
| Countries | `US,GB` | ISO codes of the *selected place*; empty = all |
| Target Field | `street.0`, `city`, `region`, `#my-field` | Field code, or CSS selector scoped to the form |
| Template | `{street_number} {route}` | `{type}`, `{type:short}`, `{a\|b}` fallbacks |

`region` selects the State/Province option (matched by label, then short code) or fills the text field for
countries without a region list. `country_id` is always applied first so region lists are up to date.
Missing components either clear the field or keep it (setting); the search field itself is never left
empty. Default rows cover street (number-last, with a number-first override for US, GB, ZA, FR...),
`street.1` (subpremise), city (with `postal_town`/sublocality fallbacks), postcode, country and region.

## Adding address search to another form

**Same markup as the customer address form** (e.g. a custom page rendering `address/edit.phtml`):

1. Register a form code in your module's `etc/di.xml` so admins can toggle it:

   ```xml
   <type name="Vaimo\GoogleAddressSearchV2\Model\Config\Source\Forms">
       <arguments>
           <argument name="forms" xsi:type="array">
               <item name="b2b_company_address" xsi:type="string" translatable="true">B2B Company Address</item>
           </argument>
       </arguments>
   </type>
   ```

2. In the page's layout handle, reuse the DOM handle and point it at your form:

   ```xml
   <update handle="vaimo_google_address_search_v2_dom_form"/>
   <body>
       <referenceBlock name="vaimo.gas.v2.dom_form">
           <arguments>
               <argument name="targets" xsi:type="array">
                   <item name="address_form" xsi:type="array">
                       <item name="selector" xsi:type="string">form.company-address #street_1</item>
                       <item name="form" xsi:type="string">b2b_company_address</item>
                   </item>
               </argument>
           </arguments>
       </referenceBlock>
   </body>
   ```

`view/frontend/layout/vaimo_google_address_search_v2_multishipping.xml` is a working example.

**UI component forms:** give the street line 0 component the class `vaimo-gas-v2` and the config
`vaimoGasV2Form: "<form code>"` (see `Plugin\Checkout\MarkAddressSearchFields`), and include the
`init.phtml` block with a `ui-form` target selector `.vaimo-gas-v2 input`. Sibling fields resolve by name
(`<fieldset>.city`, `<fieldset>.street.1`).

**Other markup:** write an adapter implementing the contract in `core/form-filler.js` and register it in
`bootstrap.js`.

## Edge cases handled

- Missing/invalid key, API not enabled, billing disabled → field silently becomes a plain input
- Quota exceeded → error message, backoff, no request storm
- Typing fast / out-of-order responses → only the latest response is rendered
- Cleared input → pending work cancelled, session ended; optionally clears fields filled by the last selection (untouched ones only)
- Incomplete places (no number, postcode, region) → fallbacks, then clear/keep per setting
- Manual edits after selection are never overwritten until the next selection
- Country changed in the form → suggestions, cache and session reset
- Checkout re-renders, modals, several address forms on one page → one instance per input element

## Hyvä

The `core/*` files are UMD modules with no dependencies: they load as RequireJS modules in Luma, as
globals (`window.VaimoGasV2`) in a plain `<script>`, and in Node for tests. A Hyvä implementation needs a
template that loads them, a small adapter (Alpine/DOM) implementing the form-filler contract, and Tailwind
styles for the `vaimo-gas-v2__*` classes. The PHP config, ViewModel and validation are reused as-is.

## Migrating from V1

| V1 | V2 |
|---|---|
| Customers > Google Address Search | Vaimo Frontend > Google Address Search V2 |
| Legacy `google.maps.places.Autocomplete` widget | Places API (New) programmatic suggestions + own UI |
| Hardcoded `countryRestriction: ['za']` in layout | Admin setting (fixed list, form country, store countries) |
| Hardcoded field ids/selectors in JS | Admin field mapping |
| `setInterval` polling in checkout | Lazy init on focus, server-side field marking |
| Backend key + Geocoding console command | Not needed (no server calls) |
| Admin customer/order address forms | Not in V2 scope yet; keep V1 for admin if needed |

Steps per store view: enable **Places API (New)** on the key (V1 used the legacy API), configure V2,
then set *V1 Enabled = No*. V2 activates automatically once V1 is off for that store view.

## Tests

```bash
node --test Test/js/address-mapper.test.js Test/js/places-client.test.js Test/js/search-controller.test.js
```

## Luma styles

Styles are in `view/frontend/web/css/source/_module.less` and compile into Luma's `styles-m.css`. After
changing them in developer mode, rebuild the theme, e.g. `grunt clean:luma exec:luma less:luma`.
