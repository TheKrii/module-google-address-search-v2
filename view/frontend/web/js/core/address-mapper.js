/**
 * Copyright © Vaimo Group. All rights reserved.
 *
 * Pure mapping of Google address components to form field values. No DOM, no Google SDK.
 */
(function (root, factory) {
    'use strict';

    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.VaimoGasV2 = root.VaimoGasV2 || {};
        root.VaimoGasV2.addressMapper = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var TOKEN = /\{([^{}]+)\}/g;

    /**
     * @param {Array<{long: string, short: string, types: string[]}>} components
     * @return {Object<string, {long: string, short: string}>} First component per type
     */
    function indexComponents(components) {
        var index = {};

        (components || []).forEach(function (component) {
            (component.types || []).forEach(function (type) {
                if (!index[type]) {
                    index[type] = {long: component.long || '', short: component.short || ''};
                }
            });
        });

        return index;
    }

    /**
     * Renders "{route} {street_number}", "{country:short}", "{locality|postal_town}".
     * Missing parts render empty; leftover separators and whitespace are cleaned up.
     */
    function render(template, index, preferShort) {
        var value = String(template).replace(TOKEN, function (match, body) {
            var parts = body.split('|'),
                i,
                pair,
                component,
                format;

            for (i = 0; i < parts.length; i++) {
                pair = parts[i].trim().split(':');
                component = index[pair[0]];
                format = pair[1] || (preferShort ? 'short' : 'long');

                if (component && component[format]) {
                    return component[format];
                }
            }

            return '';
        });

        return value
            .replace(/\s+/g, ' ')
            .replace(/\s+([,;])/g, '$1')
            .replace(/([,;\/-])(\s*[,;\/-])+/g, '$1')
            .replace(/^[\s,;\/-]+|[\s,;\/-]+$/g, '');
    }

    function specificity(row, form, country) {
        var formMatch = row.form === '' || row.form === form,
            countries = row.countries || [],
            countryMatch = countries.length === 0 || countries.indexOf(country) !== -1;

        if (!formMatch || !countryMatch) {
            return -1;
        }

        return (row.form ? 2 : 0) + (countries.length ? 1 : 0);
    }

    /**
     * Picks the most specific row per target (form + country > form > country > generic; first wins on ties)
     * and renders it. "alt" is the same template rendered with short names, used to match select options.
     *
     * @return {{country: string, fields: Array<{target: string, value: string, alt: string}>}}
     */
    function map(components, rows, context) {
        var index = indexComponents(components),
            country = index.country ? String(index.country.short).toUpperCase() : '',
            form = (context && context.form) || '',
            best = {},
            order = [];

        (rows || []).forEach(function (row) {
            var score = specificity(row, form, country);

            if (score < 0) {
                return;
            }
            if (!best.hasOwnProperty(row.field)) {
                order.push(row.field);
            }
            if (!best[row.field] || score > best[row.field].score) {
                best[row.field] = {score: score, row: row};
            }
        });

        return {
            country: country,
            fields: order.map(function (target) {
                var template = best[target].row.template;

                return {
                    target: target,
                    value: render(template, index, false),
                    alt: render(template, index, true)
                };
            })
        };
    }

    function normalize(text) {
        var value = String(text === null || text === undefined ? '' : text).toLowerCase().trim();

        return typeof value.normalize === 'function' ?
            value.normalize('NFD').replace(/[̀-ͯ]/g, '') :
            value;
    }

    /**
     * Finds the option matching a value or its short alternative: by option value first, then by label.
     *
     * @param {Array<{value: *, label: *}>} options
     * @return {Object|null}
     */
    function matchOption(options, value, alt) {
        var wanted = [normalize(value), normalize(alt)].filter(Boolean),
            i,
            j;

        if (!wanted.length) {
            return null;
        }

        for (j = 0; j < 2; j++) {
            for (i = 0; i < options.length; i++) {
                if (options[i].value === '' || options[i].value === null || options[i].value === undefined) {
                    continue;
                }
                if (wanted.indexOf(normalize(j === 0 ? options[i].value : options[i].label)) !== -1) {
                    return options[i];
                }
            }
        }

        return null;
    }

    return {
        indexComponents: indexComponents,
        render: render,
        map: map,
        matchOption: matchOption,
        normalize: normalize
    };
}));
