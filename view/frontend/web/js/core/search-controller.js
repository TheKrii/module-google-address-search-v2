/**
 * Copyright © Vaimo Group. All rights reserved.
 *
 * Input behaviour for one search field: minimum length, debounce, rate limit, stale-response guard,
 * keyboard handling and selection. Framework-agnostic: talks to a client (suggest/details) and a list
 * (SuggestionList-compatible) and reports selections through callbacks.
 */
(function (root, factory) {
    'use strict';

    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.VaimoGasV2 = root.VaimoGasV2 || {};
        root.VaimoGasV2.SearchController = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var LOADING_DELAY = 200,
        BLUR_CLOSE_DELAY = 150;

    function normalize(value) {
        return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    }

    /**
     * @param {HTMLInputElement} input
     * @param {Object} options
     * @param {Object} options.client PlacesClient-compatible
     * @param {Object} options.list SuggestionList-compatible
     * @param {number} options.minChars
     * @param {number} options.debounceMs
     * @param {number} [options.minIntervalMs]
     * @param {Function} options.getRegions Returns the current country restriction
     * @param {Function} options.onPick (suggestion) => Promise, resolves once fields are populated
     * @param {Function} [options.onCleared]
     * @param {Function} [options.log]
     */
    function SearchController(input, options) {
        var self = this;

        this.input = input;
        this.options = options;
        this.log = options.log || function () {};
        this.seq = 0;
        this.timer = null;
        this.loadingTimer = null;
        this.blurTimer = null;
        this.lastRequestAt = 0;
        this.suppressPrefix = null;
        this.lastValue = normalize(input.value);
        this.disabled = false;
        this.picking = false;

        this.handlers = {
            input: function () {
                self.handleInput();
            },
            keydown: function (event) {
                self.handleKey(event);
            },
            blur: function () {
                self.blurTimer = setTimeout(function () {
                    self.options.list.close();
                }, BLUR_CLOSE_DELAY);
            },
            focus: function () {
                clearTimeout(self.blurTimer);
            }
        };

        Object.keys(this.handlers).forEach(function (name) {
            input.addEventListener(name, self.handlers[name]);
        });
    }

    SearchController.prototype.cancelPending = function () {
        clearTimeout(this.timer);
        clearTimeout(this.loadingTimer);
        this.timer = null;
        // Any response still in flight is now stale
        this.seq++;
    };

    SearchController.prototype.handleInput = function () {
        var value = normalize(this.input.value),
            minChars = this.options.minChars;

        // Input events fired by populating the field itself are not typing
        if (this.disabled || this.picking || value === this.lastValue) {
            return;
        }
        this.lastValue = value;

        if (value === '') {
            this.cancelPending();
            this.options.list.clear();
            this.suppressPrefix = null;
            if (this.options.onCleared) {
                this.options.onCleared();
            }

            return;
        }

        // After a selection, small edits (e.g. adding a flat number) must not start a new paid search
        if (this.suppressPrefix !== null) {
            if (value.length >= minChars && value.indexOf(this.suppressPrefix) === 0) {
                return;
            }
            this.suppressPrefix = null;
        }

        if (value.length < minChars) {
            this.cancelPending();
            this.options.list.clear();
            this.log('skipped: below minimum characters');

            return;
        }

        this.schedule(this.options.debounceMs);
    };

    SearchController.prototype.schedule = function (delay) {
        var self = this;

        clearTimeout(this.timer);
        this.timer = setTimeout(function () {
            self.run();
        }, Math.max(0, delay));
    };

    SearchController.prototype.run = function () {
        var self = this,
            wait = this.lastRequestAt + (this.options.minIntervalMs || 0) - Date.now(),
            seq,
            input = this.input.value;

        if (wait > 0) {
            this.schedule(wait);

            return;
        }

        seq = ++this.seq;
        this.lastRequestAt = Date.now();
        clearTimeout(this.loadingTimer);
        this.loadingTimer = setTimeout(function () {
            if (seq === self.seq) {
                self.options.list.showMessage('loading');
            }
        }, LOADING_DELAY);

        this.options.client.suggest(input, this.options.getRegions()).then(function (items) {
            if (seq !== self.seq) {
                self.log('ignored stale response');

                return;
            }
            clearTimeout(self.loadingTimer);
            if (items.length) {
                self.options.list.showItems(items);
            } else {
                self.options.list.showMessage('noResults');
            }
        }, function (error) {
            if (seq !== self.seq) {
                return;
            }
            clearTimeout(self.loadingTimer);
            self.handleError(error);
        });
    };

    SearchController.prototype.handleError = function (error) {
        var kind = error && error.kind;

        this.log('request failed: ' + (kind || 'unknown'));

        if (kind === 'fatal') {
            // Misconfigured key or API: fall back to a plain text field for the rest of the page view
            this.options.list.clear();
            this.disable();

            return;
        }

        this.options.list.showMessage('error');
    };

    SearchController.prototype.handleKey = function (event) {
        var list = this.options.list,
            item;

        if (this.disabled) {
            return;
        }

        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowUp':
                if (list.hasItems()) {
                    event.preventDefault();
                    list.move(event.key === 'ArrowDown' ? 1 : -1);
                }
                break;
            case 'Enter':
                item = list.isOpen() ? list.getActiveItem() : null;
                if (item) {
                    // Do not submit the form while choosing a suggestion
                    event.preventDefault();
                    this.pick(item);
                }
                break;
            case 'Escape':
                if (list.isOpen()) {
                    event.preventDefault();
                    list.close();
                }
                break;
            case 'Tab':
                list.close();
                break;
        }
    };

    SearchController.prototype.pick = function (item) {
        var self = this;

        if (!item) {
            return Promise.resolve();
        }

        this.cancelPending();
        this.options.list.clear();
        this.picking = true;

        return Promise.resolve(this.options.onPick(item)).then(function () {
            self.picking = false;
            self.suppressPrefix = normalize(self.input.value);
            self.lastValue = self.suppressPrefix;
        }, function (error) {
            self.picking = false;
            self.handleError(error);
        });
    };

    /** Drops in-flight results and the post-selection suppression, e.g. after a country change. */
    SearchController.prototype.reset = function () {
        this.cancelPending();
        this.options.list.clear();
        this.suppressPrefix = null;
        this.lastValue = normalize(this.input.value);
    };

    SearchController.prototype.disable = function () {
        this.cancelPending();
        this.disabled = true;
    };

    SearchController.prototype.destroy = function () {
        var self = this;

        this.disable();
        clearTimeout(this.blurTimer);
        Object.keys(this.handlers).forEach(function (name) {
            self.input.removeEventListener(name, self.handlers[name]);
        });
    };

    return SearchController;
}));
