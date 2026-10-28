# Adding Google Address Search V2 to a form

Address search attaches to a form's **first street line**. When the shopper picks a suggestion, the other
fields are filled using the admin *Field Mapping*. This guide shows the ways to connect a form, from the
simplest (layout XML only) to registering fields from your own JavaScript.

- [How it attaches](#how-it-attaches)
- [Step 1: register a form code](#step-1-register-a-form-code-always-required)
- [Example A: server-rendered form (layout only)](#example-a-server-rendered-form-layout-only)
- [Example B: form rendered later by JavaScript (modal, AJAX)](#example-b-form-rendered-later-by-javascript-modal-ajax)
- [Example C: register the field from your own JavaScript](#example-c-register-the-field-from-your-own-javascript)
- [Example D: UI component (KnockoutJS) form](#example-d-ui-component-knockoutjs-form)
- [Fields with non-standard names](#fields-with-non-standard-names)
- [Troubleshooting](#troubleshooting)

## How it attaches

The page gets the configuration once, from a layout block (`x-magento-init`). `js/bootstrap.js` then adds
**one** `focusin` listener to the document. The first time an input matching a registered selector gets
focus, address search is attached to that input.

Consequences:

- The form **does not need to exist when the page loads**. Forms added later by AJAX, modals, KnockoutJS or
  Alpine work as long as the selector matches when the shopper focuses the field.
- Nothing is loaded from Google until someone focuses the field.
- A re-rendered input gets a fresh instance; the same element is never initialised twice.
- Sibling fields (`city`, `postcode`, ...) are looked up when a suggestion is picked, not at page load.

Two adapters connect the module to a form:

| Adapter | For | Fields are found by |
|---|---|---|
| `dom-form` (default) | Plain HTML forms, e.g. `Magento_Customer::address/edit.phtml` markup | `name` attribute inside the closest `<form>`: `street.0` → `street[0]` / `street[]`, `city` → `[name="city"]` |
| `ui-form` | Magento UI component forms (checkout) | Sibling components of the street line: `<fieldset>.city`, `<fieldset>.street.1` |

## Step 1: register a form code (always required)

Every integration needs a form code, so admins can enable it and target it in the field mapping.
Add it in **your** module's `etc/di.xml`:

```xml
<type name="Vaimo\GoogleAddressSearchV2\Model\Config\Source\Forms">
    <arguments>
        <argument name="forms" xsi:type="array">
            <item name="b2b_company_address" xsi:type="string" translatable="true">B2B Company Address</item>
        </argument>
    </arguments>
</type>
```

Then, in **Stores > Configuration > Vaimo Frontend > Google Address Search V2 > General Settings >
Enabled On Forms**, select the new form and save. New form codes are **not** enabled automatically; until
they are selected there, nothing is output for them.

## Example A: server-rendered form (layout only)

Form markup (any template), using standard Magento address field names:

```html
<form class="company-address" action="..." method="post">
    <input type="text" name="street[]" id="company_street_1">
    <input type="text" name="street[]" id="company_street_2">
    <input type="text" name="city">
    <input type="text" name="postcode">
    <select name="country_id">...</select>
    <select name="region_id">...</select>
    <input type="text" name="region">
    <button type="submit">Save</button>
</form>
```

Layout file for that page, e.g. `view/frontend/layout/b2b_company_address_edit.xml`:

```xml
<page xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:noNamespaceSchemaLocation="urn:magento:framework:View/Layout/etc/page_configuration.xsd">
    <update handle="vaimo_google_address_search_v2_dom_form"/>
    <body>
        <referenceBlock name="vaimo.gas.v2.dom_form">
            <arguments>
                <argument name="targets" xsi:type="array">
                    <item name="address_form" xsi:type="array">
                        <item name="selector" xsi:type="string">form.company-address #company_street_1</item>
                        <item name="form" xsi:type="string">b2b_company_address</item>
                    </item>
                </argument>
            </arguments>
        </referenceBlock>
    </body>
</page>
```

That's all: no JavaScript. `view/frontend/layout/vaimo_google_address_search_v2_multishipping.xml` in this
module is a working example of the same pattern.

**Several forms on one page:** add one `item` per form, each with its own selector and form code.

## Example B: form rendered later by JavaScript (modal, AJAX)

Use **exactly the same layout as Example A**, on the page where the form will appear. Because the
listener matches the selector at focus time, it does not matter that the form is not in the HTML yet.

```js
// Your component, e.g. a "New company address" modal: nothing address-search specific needed
define(['jquery', 'Magento_Ui/js/modal/modal'], function ($, modal) {
    'use strict';

    return function (config, element) {
        $(element).on('click', function () {
            $.get(config.formUrl).done(function (html) {
                // Injected form contains <form class="company-address"> ... #company_street_1 ...
                $('#company-address-modal').html(html).modal('openModal');
            });
        });
    };
});
```

Requirements:

- The layout block must be on the page the form is injected into (not on the URL the HTML was loaded from).
- The injected fields must be inside a `<form>` element, so sibling fields are looked up in the right form.

## Example C: register the field from your own JavaScript

Use this when the selector is only known at runtime, or when the form belongs to a reusable JS component
that should switch address search on itself.

1. Make sure the page has the configuration. If the page has no layout target of its own, add the
   config-only handle (it outputs settings and the browser key, but no fields):

   ```xml
   <page xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="urn:magento:framework:View/Layout/etc/page_configuration.xsd">
       <update handle="vaimo_google_address_search_v2_config"/>
   </page>
   ```

2. Register the field from JavaScript with `addTarget()`:

   ```js
   define([
       'Vaimo_GoogleAddressSearchV2/js/bootstrap'
   ], function (addressSearch) {
       'use strict';

       return function (config, element) {
           // ... render your form into element ...

           addressSearch.addTarget({
               selector: '#' + element.id + ' input[name="street[0]"]',
               form: 'b2b_company_address',   // registered in di.xml and enabled in the admin
               adapter: 'dom-form'            // optional, default
           });
       };
   });
   ```

Notes:

- `addTarget()` can be called before the configuration has loaded; the target is queued until it arrives.
- If the field already has focus when you call it, address search attaches immediately.
- Without the configuration on the page (module disabled for the store view, no API key, V1 still enabled,
  or the form not enabled in the admin), `addTarget()` does nothing and the field stays a normal input.
- Do not build the configuration yourself in JavaScript; the layout block provides the validated settings,
  the field mapping and the browser key.

## Example D: UI component (KnockoutJS) form

For forms built from `jsLayout` (like checkout), mark the first street line's component with the
`vaimo-gas-v2` class and the form code, then register a `ui-form` target.

Layout (or a `LayoutProcessor`, see `Plugin\Checkout\MarkAddressSearchFields` for the checkout version):

```xml
<item name="street" xsi:type="array">
    <item name="children" xsi:type="array">
        <item name="0" xsi:type="array">
            <item name="additionalClasses" xsi:type="string">vaimo-gas-v2</item>
            <item name="config" xsi:type="array">
                <item name="vaimoGasV2Form" xsi:type="string">b2b_company_address</item>
            </item>
        </item>
    </item>
</item>
```

Target, on the same page:

```xml
<update handle="vaimo_google_address_search_v2_config"/>
<body>
    <referenceBlock name="vaimo.gas.v2.config">
        <arguments>
            <argument name="targets" xsi:type="array">
                <item name="company_ui_form" xsi:type="array">
                    <item name="selector" xsi:type="string">.vaimo-gas-v2 input</item>
                    <item name="adapter" xsi:type="string">ui-form</item>
                </item>
            </argument>
        </arguments>
    </referenceBlock>
</body>
```

Or from JavaScript: `addressSearch.addTarget({selector: '.vaimo-gas-v2 input', adapter: 'ui-form'});`

The `ui-form` adapter reads the form code from `vaimoGasV2Form` and writes values to the sibling
components' observables (`<fieldset>.city`, `<fieldset>.region_id`, ...), so Magento validation and data
providers stay in sync.

## Fields with non-standard names

If your form does not use Magento's field names, add mapping rows for your form in the admin
*Field Mapping*, with a CSS selector as the target. Selectors are scoped to the form.

| Form | Countries | Target Field | Template |
|---|---|---|---|
| B2B Company Address | | `#company-street` | `{subpremise}/{street_number} {route}` |
| B2B Company Address | | `#company-suburb` | `{sublocality_level_1\|neighborhood}` |
| B2B Company Address | | `[data-role="city"]` | `{locality}` |

Rows for a specific form win over the default rows for all forms.

## Troubleshooting

Enable **General Settings > Debug Logging (Browser Console)** and focus the field. The console shows
`[Vaimo GAS V2] attached to <form code>` when it works.

| Symptom | Cause |
|---|---|
| No `attached to` log, nothing happens | Form code not selected in *Enabled On Forms*; block not on this page; selector does not match the focused input; module disabled, no key, or V1 enabled for the store view |
| `attached to` log, but other fields are not filled | Field names differ (add selector rows), or the inputs are not inside a `<form>` |
| Region not filled | Country not set first, or the form has neither `region_id` nor `region` |
| Suggestions from the wrong country | *Country Restriction* (Fixed list = South Africa by default) |
