/**
 * Copyright © Vaimo Group. All rights reserved.
 *
 * Adapter for server-rendered address forms (Magento_Customer::address/edit.phtml and similar).
 * Field codes resolve to form elements by name: "street.N" => N-th "street[]" input, "city" => [name="city"].
 * Targets starting with #, . or [ are CSS selectors scoped to the form.
 */
define([
    'Vaimo_GoogleAddressSearchV2/js/core/address-mapper'
], function (addressMapper) {
    'use strict';

    var SELECTOR = /^[#.\[]/,
        STREET = /^street\.(\d+)$/;

    function isVisible(element) {
        return !!(element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length));
    }

    function escapeName(name) {
        return window.CSS && CSS.escape ? CSS.escape(name) : name.replace(/["\\]/g, '\\$&');
    }

    /** Native events reach jQuery handlers too (validation, region updater, etc.). */
    function dispatch(element) {
        element.dispatchEvent(new Event('input', {bubbles: true}));
        element.dispatchEvent(new Event('change', {bubbles: true}));
    }

    /**
     * Writes a value to an input or select. Shared with the UI-form adapter for selector targets.
     *
     * @return {boolean}
     */
    function writeElement(element, value, alt) {
        var option;

        if (!element || element.disabled) {
            return false;
        }

        if (element.tagName === 'SELECT') {
            if (value === '') {
                element.value = '';
            } else {
                option = addressMapper.matchOption(Array.prototype.map.call(element.options, function (node) {
                    return {value: node.value, label: node.textContent, node: node};
                }), value, alt);
                if (!option) {
                    return false;
                }
                element.value = option.value;
            }
        } else {
            element.value = value;
        }

        dispatch(element);

        return true;
    }

    function DomFormAdapter(input, target) {
        this.input = input;
        this.form = input.closest('form') || input.ownerDocument;
        this.formCode = target.form || null;
    }

    DomFormAdapter.prototype.resolve = function (target) {
        var match = STREET.exec(target),
            lines;

        if (SELECTOR.test(target)) {
            return this.form.querySelector(target);
        }
        if (match) {
            lines = this.form.querySelectorAll('[name="street[]"]');

            return lines[Number(match[1])] || this.form.querySelector('[name="street[' + match[1] + ']"]');
        }

        return this.form.querySelector('[name="' + escapeName(target) + '"]');
    };

    DomFormAdapter.prototype.getFormCode = function () {
        return this.formCode;
    };

    DomFormAdapter.prototype.getCountry = function () {
        var element = this.resolve('country_id');

        return element ? String(element.value || '').toUpperCase() : '';
    };

    DomFormAdapter.prototype.onCountryChange = function (callback) {
        var element = this.resolve('country_id');

        if (!element) {
            return function () {};
        }
        element.addEventListener('change', callback);

        return function () {
            element.removeEventListener('change', callback);
        };
    };

    DomFormAdapter.prototype.getValue = function (target) {
        var element = this.resolve(target);

        return element ? String(element.value) : null;
    };

    DomFormAdapter.prototype.setValue = function (target, value, alt) {
        return writeElement(this.resolve(target), value, alt);
    };

    DomFormAdapter.prototype.regionElements = function () {
        return {select: this.resolve('region_id'), text: this.resolve('region')};
    };

    /** Region list for countries that have one (updated by Magento's region updater), else the text field. */
    DomFormAdapter.prototype.setRegion = function (value, alt) {
        var region = this.regionElements(),
            useSelect = region.select && isVisible(region.select) && region.select.options.length > 1;

        if (useSelect) {
            return writeElement(region.select, value, alt);
        }
        if (region.text && (isVisible(region.text) || !region.select)) {
            return writeElement(region.text, value, alt);
        }

        return false;
    };

    DomFormAdapter.prototype.getRegionValue = function () {
        var region = this.regionElements();

        if (region.select && isVisible(region.select)) {
            return String(region.select.value);
        }

        return region.text ? String(region.text.value) : null;
    };

    DomFormAdapter.prototype.isSearchField = function (target) {
        return this.resolve(target) === this.input;
    };

    DomFormAdapter.prototype.setSearchText = function (text) {
        writeElement(this.input, text, '');
    };

    DomFormAdapter.prototype.isConnected = function () {
        return this.input.isConnected;
    };

    return {
        create: function (input, target) {
            return new DomFormAdapter(input, target);
        },
        writeElement: writeElement
    };
});
