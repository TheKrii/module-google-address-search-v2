/**
 * Copyright © Vaimo Group. All rights reserved.
 *
 * Google Places API (New) client built on the Maps JavaScript API Places library
 * (AutocompleteSuggestion + Place.fetchFields). One client per search field.
 *
 * Cost controls:
 *  - one session token per search, reused for every autocomplete request and the final details call,
 *    so the autocomplete requests of a completed session are not billed separately;
 *  - details are requested for addressComponents only, plus location when a mapping uses
 *    {latitude}/{longitude} (both Place Details Essentials);
 *  - identical input within a session is answered from memory (never persisted);
 *  - input extending a query that had no results is not sent again in the same session;
 *  - auth/API errors disable the client for the page, quota errors back off exponentially.
 */
(function (root, factory) {
    'use strict';

    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.VaimoGasV2 = root.VaimoGasV2 || {};
        root.VaimoGasV2.PlacesClient = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var CACHE_LIMIT = 50,
        QUOTA_BACKOFF_MIN = 30000,
        QUOTA_BACKOFF_MAX = 600000,
        FATAL = /REQUEST_DENIED|PERMISSION_DENIED|INVALID_ARGUMENT.*key|API_KEY|ApiNotActivated|ApiTargetBlocked|RefererNotAllowed|InvalidKey|not authorized|has not been used|is disabled|billing/i,
        QUOTA = /OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED|QUOTA|rate.?limit|\b429\b/i,
        KEY_PATTERN = /AIza[0-9A-Za-z_\-]{20,}/g,
        shared = {
            loaders: {},
            fatal: false,
            quotaUntil: 0,
            quotaBackoff: 0,
            authHookInstalled: false,
            callbackId: 0
        };

    function now() {
        return Date.now();
    }

    function gasError(kind, message) {
        var error = new Error(String(message || kind).replace(KEY_PATTERN, '[redacted]'));

        error.kind = kind;

        return error;
    }

    function classify(error) {
        var text = String((error && (error.code || error.status || '')) + ' ' + (error && error.message || error));

        if (error && error.kind) {
            return error;
        }
        if (FATAL.test(text)) {
            shared.fatal = true;

            return gasError('fatal', text);
        }
        if (QUOTA.test(text)) {
            shared.quotaBackoff = Math.min(Math.max(QUOTA_BACKOFF_MIN, shared.quotaBackoff * 2), QUOTA_BACKOFF_MAX);
            shared.quotaUntil = now() + shared.quotaBackoff;

            return gasError('quota', text);
        }

        return gasError('transient', text);
    }

    /** Google calls window.gm_authFailure for invalid keys, referer and API activation errors. */
    function installAuthHook() {
        var previous;

        if (shared.authHookInstalled || typeof window === 'undefined') {
            return;
        }
        shared.authHookInstalled = true;
        previous = window.gm_authFailure;
        window.gm_authFailure = function () {
            shared.fatal = true;
            if (typeof previous === 'function') {
                previous.apply(this, arguments);
            }
        };
    }

    function getGoogleMaps() {
        return typeof window !== 'undefined' && window.google && window.google.maps;
    }

    /**
     * Loads the Places library once per page, reusing a Maps JS API another module already loaded.
     * Loading the library is not billed; only requests are.
     */
    function loadPlaces(options) {
        var maps = getGoogleMaps(),
            key = options.apiKey + '|' + options.version;

        installAuthHook();

        if (maps && typeof maps.importLibrary === 'function') {
            return maps.importLibrary('places');
        }
        if (maps && maps.places && maps.places.AutocompleteSuggestion) {
            return Promise.resolve(maps.places);
        }
        if (shared.loaders[key]) {
            return shared.loaders[key];
        }

        shared.loaders[key] = new Promise(function (resolve, reject) {
            var callback = '__vaimoGasV2Ready' + (++shared.callbackId),
                script = document.createElement('script'),
                params = [
                    'key=' + encodeURIComponent(options.apiKey),
                    'v=' + encodeURIComponent(options.version || 'quarterly'),
                    'loading=async',
                    'libraries=places',
                    'callback=' + callback
                ];

            window[callback] = function () {
                delete window[callback];
                resolve(window.google.maps.importLibrary('places'));
            };
            script.src = 'https://maps.googleapis.com/maps/api/js?' + params.join('&');
            script.async = true;
            script.onerror = function () {
                delete window[callback];
                delete shared.loaders[key];
                reject(gasError('transient', 'Google Maps JavaScript API failed to load'));
            };
            document.head.appendChild(script);
        });

        return shared.loaders[key];
    }

    /**
     * Exposes the place location as pseudo components so mappings can use {latitude} and {longitude}.
     * Only present when "location" was requested (see detailFieldsFor in bootstrap.js).
     */
    function locationComponents(location) {
        var lat,
            lng;

        if (!location) {
            return [];
        }
        lat = typeof location.lat === 'function' ? location.lat() : location.lat;
        lng = typeof location.lng === 'function' ? location.lng() : location.lng;

        if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) {
            return [];
        }

        return [
            {long: lat.toFixed(7), short: lat.toFixed(7), types: ['latitude']},
            {long: lng.toFixed(7), short: lng.toFixed(7), types: ['longitude']}
        ];
    }

    function normalizeInput(input) {
        return String(input).trim().replace(/\s+/g, ' ').toLowerCase();
    }

    function toSuggestion(prediction) {
        var main = prediction.mainText,
            secondary = prediction.secondaryText;

        return {
            id: prediction.placeId,
            text: prediction.text ? prediction.text.text : '',
            mainText: main ? main.text : (prediction.text ? prediction.text.text : ''),
            mainMatches: main && main.matches ? main.matches.map(function (match) {
                return {start: match.startOffset || 0, end: match.endOffset || 0};
            }) : [],
            secondaryText: secondary ? secondary.text : '',
            prediction: prediction
        };
    }

    /**
     * @param {Object} options
     * @param {string} options.apiKey
     * @param {string} [options.version]
     * @param {string} [options.language]
     * @param {string} [options.region]
     * @param {string[]} [options.primaryTypes]
     * @param {number} [options.maxSuggestions]
     * @param {number} [options.sessionTimeoutMs]
     * @param {boolean} [options.skipDeadPrefixes]
     * @param {string[]} [options.detailFields] Place Details fields, default ['addressComponents']
     * @param {Function} [options.log]
     * @param {Function} [options.loader] Test seam, defaults to loading the Maps JS API
     */
    function PlacesClient(options) {
        this.options = options;
        this.loader = options.loader || loadPlaces;
        this.log = options.log || function () {};
        this.token = null;
        this.lastActivity = 0;
        this.cache = new Map();
        this.deadPrefixes = [];
        this.stats = {requests: 0, cacheHits: 0, deadPrefixSkips: 0, details: 0, sessions: 0};
    }

    PlacesClient.prototype.availability = function () {
        if (shared.fatal) {
            return 'fatal';
        }
        if (now() < shared.quotaUntil) {
            return 'quota';
        }

        return 'ok';
    };

    /** Warm up the library on focus so the first search is not delayed by script loading. */
    PlacesClient.prototype.preload = function () {
        if (this.availability() === 'fatal') {
            return Promise.resolve(null);
        }

        return this.loader(this.options).catch(function () {
            return null;
        });
    };

    PlacesClient.prototype.expireIdleSession = function () {
        if (this.token && now() - this.lastActivity > (this.options.sessionTimeoutMs || 180000)) {
            this.log('session expired');
            this.endSession();
        }
    };

    PlacesClient.prototype.endSession = function () {
        this.token = null;
        this.cache.clear();
        this.deadPrefixes = [];
    };

    PlacesClient.prototype.ensureSession = function (places) {
        if (!this.token) {
            this.token = new places.AutocompleteSessionToken();
            this.stats.sessions++;
            this.log('session started');
        }
        this.lastActivity = now();
    };

    PlacesClient.prototype.lookupMemory = function (cacheKey, regionsKey, normalized) {
        var i;

        if (this.cache.has(cacheKey)) {
            this.stats.cacheHits++;
            this.lastActivity = now();
            this.log('cache hit');

            return this.cache.get(cacheKey);
        }

        if (this.options.skipDeadPrefixes) {
            for (i = 0; i < this.deadPrefixes.length; i++) {
                if (this.deadPrefixes[i].regions === regionsKey &&
                    normalized.indexOf(this.deadPrefixes[i].input) === 0) {
                    this.stats.deadPrefixSkips++;
                    this.log('skipped: extends a query without results');

                    return [];
                }
            }
        }

        return null;
    };

    PlacesClient.prototype.remember = function (cacheKey, regionsKey, normalized, items) {
        if (this.cache.size >= CACHE_LIMIT) {
            this.cache.delete(this.cache.keys().next().value);
        }
        this.cache.set(cacheKey, items);

        if (!items.length) {
            this.deadPrefixes.push({regions: regionsKey, input: normalized});
        }
    };

    /**
     * @param {string} input
     * @param {string[]} regions ISO country codes, at most 15
     * @return {Promise<Array>}
     */
    PlacesClient.prototype.suggest = function (input, regions) {
        var self = this,
            state = this.availability(),
            normalized = normalizeInput(input),
            regionsKey = (regions || []).join(','),
            cacheKey = regionsKey + '|' + normalized,
            remembered;

        if (state !== 'ok') {
            return Promise.reject(gasError(state));
        }

        this.expireIdleSession();
        remembered = this.lookupMemory(cacheKey, regionsKey, normalized);

        if (remembered) {
            return Promise.resolve(remembered);
        }

        return this.loader(this.options).then(function (places) {
            var request = {input: String(input).trim()};

            self.ensureSession(places);
            request.sessionToken = self.token;

            if (self.options.language) {
                request.language = self.options.language;
            }
            if (self.options.region) {
                request.region = self.options.region;
            }
            if (regions && regions.length) {
                request.includedRegionCodes = regions.slice(0, 15);
            }
            if (self.options.primaryTypes && self.options.primaryTypes.length) {
                request.includedPrimaryTypes = self.options.primaryTypes.slice(0, 5);
            }

            self.stats.requests++;
            self.log('autocomplete request #' + self.stats.requests);

            return places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
        }).then(function (response) {
            var items = ((response && response.suggestions) || [])
                .filter(function (suggestion) {
                    return suggestion.placePrediction;
                })
                .map(function (suggestion) {
                    return toSuggestion(suggestion.placePrediction);
                })
                .slice(0, self.options.maxSuggestions || 5);

            shared.quotaBackoff = 0;
            self.remember(cacheKey, regionsKey, normalized, items);

            return items;
        }, function (error) {
            throw classify(error);
        });
    };

    /**
     * Fetches only the requested fields of the selected place and concludes the session.
     *
     * @return {Promise<Array<{long: string, short: string, types: string[]}>>}
     */
    PlacesClient.prototype.details = function (suggestion) {
        var self = this,
            state = this.availability(),
            place;

        if (state !== 'ok') {
            return Promise.reject(gasError(state));
        }

        return this.loader(this.options).then(function () {
            // toPlace() carries the session token of the prediction into the details request
            place = suggestion.prediction.toPlace();
            self.stats.details++;
            self.log('place details request');

            return place.fetchFields({fields: self.options.detailFields || ['addressComponents']});
        }).then(function () {
            var components = (place.addressComponents || []).map(function (component) {
                return {
                    long: component.longText || '',
                    short: component.shortText || '',
                    types: component.types || []
                };
            });

            self.endSession();

            return components.concat(locationComponents(place.location));
        }, function (error) {
            throw classify(error);
        });
    };

    /** Test helper: resets page-wide error state. */
    PlacesClient.resetSharedState = function () {
        shared.fatal = false;
        shared.quotaUntil = 0;
        shared.quotaBackoff = 0;
        shared.loaders = {};
    };

    PlacesClient.classify = classify;

    return PlacesClient;
}));
