/**
 * Copyright © Vaimo Group. All rights reserved.
 *
 * Adapter for Magento UI component forms (checkout shipping and billing addresses).
 * The search input's Knockout context is its field component ("<fieldset>.street.0"); every other target
 * resolves to the sibling component "<fieldset>.<target>", so "street.1", "city", "country_id" work as-is.
 * Values are written to the component observables, which keeps checkout validation and quote updates intact.
 */
define([
    'ko',
    'uiRegistry',
    'Vaimo_GoogleAddressSearchV2/js/core/address-mapper',
    'Vaimo_GoogleAddressSearchV2/js/adapter/dom-form'
], function (ko, registry, addressMapper, domForm) {
    'use strict';

    var SELECTOR = /^[#.\[]/,
        STREET_LINE = /^(.*)\.street\.\d+$/;

    function isVisible(component) {
        return !component || typeof component.visible !== 'function' || component.visible();
    }

    function optionsOf(component) {
        var options = component && component.options;

        options = typeof options === 'function' ? options() : options;

        return Array.isArray(options) ? options : [];
    }

    function UiFormAdapter(input, component, fieldset) {
        this.input = input;
        this.component = component;
        this.fieldset = fieldset;
    }

    UiFormAdapter.prototype.get = function (target) {
        return registry.get(this.fieldset + '.' + target);
    };

    UiFormAdapter.prototype.getFormCode = function () {
        var name = this.component.name;

        if (this.component.vaimoGasV2Form) {
            return this.component.vaimoGasV2Form;
        }

        return name.indexOf('shipping') !== -1 ? 'checkout_shipping' : 'checkout_billing';
    };

    UiFormAdapter.prototype.getCountry = function () {
        var country = this.get('country_id');

        return country && typeof country.value === 'function' ? String(country.value() || '').toUpperCase() : '';
    };

    UiFormAdapter.prototype.onCountryChange = function (callback) {
        var country = this.get('country_id'),
            subscription;

        if (!country || !ko.isObservable(country.value)) {
            return function () {};
        }
        subscription = country.value.subscribe(callback);

        return function () {
            subscription.dispose();
        };
    };

    UiFormAdapter.prototype.writeComponent = function (component, value, alt) {
        var options,
            option;

        if (!component || typeof component.value !== 'function' || (component.disabled && component.disabled())) {
            return false;
        }

        options = optionsOf(component);
        if (options.length && value !== '') {
            option = addressMapper.matchOption(options, value, alt);
            if (!option) {
                return false;
            }
            value = option.value;
        }

        component.value(value);

        return true;
    };

    UiFormAdapter.prototype.getValue = function (target) {
        var component,
            element;

        if (SELECTOR.test(target)) {
            element = this.queryScoped(target);

            return element ? String(element.value) : null;
        }
        component = this.get(target);

        return component && typeof component.value === 'function' ? String(component.value() || '') : null;
    };

    /**
     * CSS selector targets are scoped to the address form. The street lines sit in their own <fieldset>,
     * so the form element is preferred over the nearest fieldset.
     */
    UiFormAdapter.prototype.queryScoped = function (selector) {
        var scope = this.input.closest('form') || this.input.closest('fieldset:not(.street)') || this.input.ownerDocument;

        return scope.querySelector(selector);
    };

    UiFormAdapter.prototype.setValue = function (target, value, alt) {
        if (SELECTOR.test(target)) {
            return domForm.writeElement(this.queryScoped(target), value, alt);
        }

        return this.writeComponent(this.get(target), value, alt);
    };

    /**
     * Free-text region field: "region_id_input" in checkout address forms, "region" in older/custom forms.
     */
    UiFormAdapter.prototype.getRegionText = function () {
        return this.get('region_id_input') || this.get('region');
    };

    /** region_id is a filtered select when the country has regions; otherwise the region text field shows. */
    UiFormAdapter.prototype.setRegion = function (value, alt) {
        var select = this.get('region_id'),
            text = this.getRegionText();

        if (select && isVisible(select) && optionsOf(select).length) {
            return this.writeComponent(select, value, alt);
        }
        if (text && isVisible(text)) {
            return this.writeComponent(text, value, alt);
        }

        return false;
    };

    UiFormAdapter.prototype.getRegionValue = function () {
        var select = this.get('region_id'),
            text = this.getRegionText();

        if (select && isVisible(select)) {
            return String(select.value() || '');
        }

        return text ? String(text.value() || '') : null;
    };

    UiFormAdapter.prototype.isSearchField = function (target) {
        return this.get(target) === this.component;
    };

    UiFormAdapter.prototype.setSearchText = function (text) {
        this.component.value(text);
    };

    UiFormAdapter.prototype.isConnected = function () {
        return this.input.isConnected;
    };

    return {
        /**
         * @return {UiFormAdapter|null} Null when the input is not a street line of a UI component form
         */
        create: function (input) {
            var component = ko.dataFor(input),
                match = component && typeof component.name === 'string' ? STREET_LINE.exec(component.name) : null;

            return match ? new UiFormAdapter(input, component, match[1]) : null;
        }
    };
});
