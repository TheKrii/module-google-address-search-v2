/**
 * Copyright © Vaimo Group. All rights reserved.
 *
 * Luma entry point (x-magento-init). Registers target selectors and attaches address search lazily,
 * the first time a matching input receives focus. One delegated listener per page serves any number of
 * forms and fields, works for inputs rendered later (checkout, modals) and never double-initialises:
 * each input element gets at most one instance, a re-rendered input gets a fresh one.
 */
define([
    'Vaimo_GoogleAddressSearchV2/js/core/address-mapper',
    'Vaimo_GoogleAddressSearchV2/js/core/places-client',
    'Vaimo_GoogleAddressSearchV2/js/core/suggestion-list',
    'Vaimo_GoogleAddressSearchV2/js/core/search-controller',
    'Vaimo_GoogleAddressSearchV2/js/core/form-filler',
    'Vaimo_GoogleAddressSearchV2/js/adapter/dom-form',
    'Vaimo_GoogleAddressSearchV2/js/adapter/ui-form'
], function (addressMapper, PlacesClient, SuggestionList, SearchController, formFiller, domForm, uiForm) {
    'use strict';

    var adapters = {'dom-form': domForm, 'ui-form': uiForm},
        registrations = [],
        instances = new WeakMap(),
        listening = false,
        pendingTargets = [],
        pageConfig = null;

    function logger(config) {
        return function (message) {
            if (config.debug && window.console) {
                console.debug('[Vaimo GAS V2] ' + message);
            }
        };
    }

    function regionsFor(config, adapter) {
        var search = config.search,
            country;

        switch (search.countryMode) {
            case 'form':
                country = adapter.getCountry();

                return country ? [country] : (search.countries.length ? search.countries : search.allowedCountries);
            case 'fixed':
                return search.countries;
            case 'allowed':
                return search.allowedCountries;
            default:
                return [];
        }
    }

    function attach(input, registration) {
        var config = registration.config,
            log = logger(config),
            adapter = adapters[registration.adapter].create(input, registration),
            form = adapter && adapter.getFormCode(),
            instance,
            client,
            list,
            controller,
            unsubscribeCountry;

        if (!adapter || config.forms.indexOf(form) === -1) {
            instances.set(input, null);

            return;
        }

        instance = {written: {}, filling: false};
        client = new PlacesClient({
            apiKey: config.google.apiKey,
            version: config.google.version,
            language: config.google.language,
            region: config.google.region,
            primaryTypes: config.google.primaryTypes,
            maxSuggestions: config.search.maxSuggestions,
            sessionTimeoutMs: config.search.sessionTimeoutMs,
            skipDeadPrefixes: config.search.skipDeadPrefixes,
            detailFields: addressMapper.detailFields(config.fill.mappings),
            log: log
        });

        if (client.availability() === 'fatal') {
            instances.set(input, null);

            return;
        }

        list = new SuggestionList(input, {
            i18n: config.i18n,
            onPick: function (item) {
                controller.pick(item);
            }
        });

        controller = new SearchController(input, {
            client: client,
            list: list,
            minChars: config.search.minChars,
            debounceMs: config.search.debounceMs,
            minIntervalMs: config.search.minIntervalMs,
            log: log,
            getRegions: function () {
                return regionsFor(config, adapter);
            },
            onPick: function (item) {
                if (!config.fill.enabled) {
                    // No details request; the abandoned session's requests are billed individually
                    client.endSession();
                    adapter.setSearchText(item.mainText);

                    return Promise.resolve();
                }

                return client.details(item).then(function (components) {
                    instance.filling = true;
                    try {
                        instance.written = formFiller.fill(adapter, components, item, config.fill, form);
                    } finally {
                        instance.filling = false;
                    }
                    list.announce(config.i18n.filled);
                    log('fields populated: ' + Object.keys(instance.written).length);
                });
            },
            onCleared: function () {
                client.endSession();
                if (config.fill.onClear === 'clear_filled') {
                    instance.filling = true;
                    try {
                        formFiller.clearFilled(adapter, instance.written);
                    } finally {
                        instance.filling = false;
                    }
                }
                instance.written = {};
            }
        });

        // A different country invalidates suggestions, cached results and the session restriction
        unsubscribeCountry = adapter.onCountryChange(function () {
            if (!instance.filling) {
                log('country changed');
                controller.reset();
                client.endSession();
            }
        });

        if (config.search.disableBrowserAutofill) {
            input.setAttribute('autocomplete', 'off');
        }

        instance.destroy = function () {
            unsubscribeCountry();
            controller.destroy();
            list.destroy();
        };
        instances.set(input, instance);
        client.preload();
        log('attached to ' + form);
    }

    function onFocusIn(event) {
        var input = event.target,
            i;

        if (!(input instanceof HTMLInputElement) || instances.has(input)) {
            return;
        }

        for (i = 0; i < registrations.length; i++) {
            if (input.matches(registrations[i].selector)) {
                attach(input, registrations[i]);

                return;
            }
        }
    }

    function register(target, config) {
        registrations.push({
            selector: target.selector,
            adapter: adapters[target.adapter] ? target.adapter : 'dom-form',
            form: target.form,
            config: config
        });

        if (!listening) {
            document.addEventListener('focusin', onFocusIn, true);
            listening = true;
        }

        // The field may already have focus (autofocus, or focus before RequireJS finished loading)
        if (document.activeElement) {
            onFocusIn({target: document.activeElement});
        }
    }

    /**
     * x-magento-init entry point.
     *
     * @param {Object} config From ViewModel\AddressSearch::getJsConfig()
     */
    function bootstrap(config) {
        pageConfig = config;
        (config.targets || []).forEach(function (target) {
            register(target, config);
        });
        pendingTargets.splice(0).forEach(function (target) {
            register(target, config);
        });
    }

    /**
     * Registers a field from JavaScript, using the configuration the page already received from the layout
     * (any target block, or the config-only handle "vaimo_google_address_search_v2_config").
     * Safe to call before that configuration has loaded: the target is queued until it arrives.
     * The form code must be registered in di.xml and enabled in the admin, like layout targets.
     *
     * @param {{selector: string, form: string, adapter: (string|undefined)}} target
     */
    bootstrap.addTarget = function (target) {
        if (!target || !target.selector) {
            return;
        }
        if (pageConfig) {
            register(target, pageConfig);
        } else {
            pendingTargets.push(target);
        }
    };

    return bootstrap;
});
