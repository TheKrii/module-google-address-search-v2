/**
 * Copyright © Vaimo Group. All rights reserved.
 *
 * Applies mapped address values to a form through a frontend adapter.
 *
 * Adapter contract (see adapter/dom-form.js, adapter/ui-form.js):
 *   getFormCode(): string|null
 *   getCountry(): string                       current country code of the form, upper case
 *   onCountryChange(callback): Function        returns an unsubscribe function
 *   getValue(target): string|null              null when the target does not exist
 *   setValue(target, value, alt): boolean      selects option by value/label for selects
 *   setRegion(value, alt): boolean             region select, or region text field
 *   getRegionValue(): string|null
 *   isSearchField(target): boolean
 *   setSearchText(text): void                  sets the search input itself
 * An empty value clears a field (select: back to the empty option).
 */
(function (root, factory) {
    'use strict';

    if (typeof define === 'function' && define.amd) {
        define(['./address-mapper'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./address-mapper'));
    } else {
        root.VaimoGasV2 = root.VaimoGasV2 || {};
        root.VaimoGasV2.formFiller = factory(root.VaimoGasV2.addressMapper);
    }
}(typeof self !== 'undefined' ? self : this, function (addressMapper) {
    'use strict';

    var COUNTRY = 'country_id',
        REGION = 'region';

    function rank(target) {
        if (target === COUNTRY) {
            return 0;
        }

        return target === REGION ? 2 : 1;
    }

    /**
     * @param {Object} adapter
     * @param {Array} components Google address components
     * @param {Object} suggestion The picked suggestion (fallback text for the search field)
     * @param {Object} fillConfig {mappings, missingComponent}
     * @param {string} form
     * @return {Object<string, string>} Values actually written, by target
     */
    function fill(adapter, components, suggestion, fillConfig, form) {
        var result = addressMapper.map(components, fillConfig.mappings, {form: form}),
            written = {},
            searchFilled = false;

        result.fields.slice().sort(function (a, b) {
            return rank(a.target) - rank(b.target);
        }).forEach(function (field) {
            var value = field.value,
                isSearch = adapter.isSearchField(field.target),
                ok;

            if (isSearch) {
                searchFilled = true;
                // Never leave the field the shopper typed into empty
                value = value || suggestion.mainText;
            }
            if (!value && fillConfig.missingComponent === 'keep') {
                return;
            }

            ok = field.target === REGION ?
                adapter.setRegion(value, field.alt) :
                adapter.setValue(field.target, value, field.alt);

            if (ok) {
                written[field.target] = field.target === REGION ? adapter.getRegionValue() : adapter.getValue(field.target);
            }
        });

        if (!searchFilled) {
            adapter.setSearchText(suggestion.mainText);
        }

        return written;
    }

    /**
     * Clears fields written by the last selection, unless the shopper has changed them since.
     */
    function clearFilled(adapter, written) {
        Object.keys(written || {}).forEach(function (target) {
            var current = target === REGION ? adapter.getRegionValue() : adapter.getValue(target);

            if (target === COUNTRY || adapter.isSearchField(target) || current !== written[target]) {
                return;
            }
            if (target === REGION) {
                adapter.setRegion('', '');
            } else {
                adapter.setValue(target, '', '');
            }
        });
    }

    return {
        fill: fill,
        clearFilled: clearFilled
    };
}));
