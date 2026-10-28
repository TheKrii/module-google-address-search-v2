/**
 * Copyright © Vaimo Group. All rights reserved.
 *
 * Accessible suggestion listbox for a search input (WAI-ARIA combobox with listbox popup).
 * Plain DOM, no framework; the look is defined by the theme's CSS for the "vaimo-gas-v2" classes.
 * Text is always inserted as text nodes, never as HTML.
 */
(function (root, factory) {
    'use strict';

    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.VaimoGasV2 = root.VaimoGasV2 || {};
        root.VaimoGasV2.SuggestionList = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var B = 'vaimo-gas-v2',
        uid = 0;

    function el(tag, className, attributes) {
        var node = document.createElement(tag),
            name;

        if (className) {
            node.className = className;
        }
        for (name in attributes || {}) {
            if (attributes.hasOwnProperty(name)) {
                node.setAttribute(name, attributes[name]);
            }
        }

        return node;
    }

    /** Main text with matched ranges in <strong>, built from text nodes only. */
    function highlighted(text, matches) {
        var fragment = document.createDocumentFragment(),
            cursor = 0;

        (matches || []).slice().sort(function (a, b) {
            return a.start - b.start;
        }).forEach(function (match) {
            var strong;

            if (match.start < cursor || match.end <= match.start || match.end > text.length) {
                return;
            }
            fragment.appendChild(document.createTextNode(text.slice(cursor, match.start)));
            strong = el('strong', B + '__match');
            strong.appendChild(document.createTextNode(text.slice(match.start, match.end)));
            fragment.appendChild(strong);
            cursor = match.end;
        });
        fragment.appendChild(document.createTextNode(text.slice(cursor)));

        return fragment;
    }

    /**
     * @param {HTMLInputElement} input
     * @param {Object} options
     * @param {Object} options.i18n
     * @param {Function} options.onPick Called with the picked suggestion
     */
    function SuggestionList(input, options) {
        var self = this,
            host = input.parentNode;

        this.input = input;
        this.options = options;
        this.items = [];
        this.active = -1;
        this.id = B + '-' + (++uid);

        // Remove a dropdown left behind by a previous render of the same field
        Array.prototype.forEach.call(host.querySelectorAll(':scope > .' + B + '__dropdown, :scope > .' + B + '__live'),
            function (stale) {
                stale.parentNode.removeChild(stale);
            });

        this.root = el('div', B + '__dropdown', {hidden: 'hidden'});
        this.list = el('ul', B + '__list', {
            id: this.id + '-listbox',
            role: 'listbox',
            'aria-label': options.i18n.listLabel
        });
        this.state = el('div', B + '__state');
        this.footer = el('div', B + '__attribution');
        this.footer.appendChild(el('span', B + '__attribution-text', {translate: 'no'}))
            .appendChild(document.createTextNode('Google Maps'));
        this.live = el('div', B + '__live', {role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true'});

        this.root.appendChild(this.list);
        this.root.appendChild(this.state);
        this.root.appendChild(this.footer);
        host.classList.add(B + '__host');
        host.insertBefore(this.root, input.nextSibling);
        host.insertBefore(this.live, this.root.nextSibling);

        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-controls', this.list.id);

        // Keep focus in the input while interacting with the list. Touch taps emit an emulated mousedown,
        // so this covers touch too without blocking scrolling of the list.
        this.onPointerDown = function (event) {
            event.preventDefault();
        };
        this.onClick = function (event) {
            var option = event.target.closest('[role="option"]');

            if (option && self.root.contains(option)) {
                self.options.onPick(self.items[Number(option.getAttribute('data-index'))]);
            }
        };
        this.onHover = function (event) {
            var option = event.target.closest('[role="option"]');

            if (option) {
                self.setActive(Number(option.getAttribute('data-index')), false);
            }
        };
        this.root.addEventListener('mousedown', this.onPointerDown);
        this.root.addEventListener('click', this.onClick);
        this.root.addEventListener('mousemove', this.onHover);
    }

    SuggestionList.prototype.isOpen = function () {
        return !this.root.hidden;
    };

    SuggestionList.prototype.hasItems = function () {
        return this.items.length > 0;
    };

    /**
     * Anchors the dropdown to the input itself: the host may also contain other fields
     * (Luma renders street line 2 inside the same .control as line 1).
     */
    SuggestionList.prototype.position = function () {
        var input = this.input;

        if (input.offsetParent === this.root.offsetParent) {
            this.root.style.top = (input.offsetTop + input.offsetHeight) + 'px';
            this.root.style.left = input.offsetLeft + 'px';
            this.root.style.width = input.offsetWidth + 'px';
            this.root.style.right = 'auto';
        }
    };

    SuggestionList.prototype.open = function () {
        this.root.hidden = false;
        this.position();
        this.input.setAttribute('aria-expanded', this.items.length ? 'true' : 'false');
    };

    SuggestionList.prototype.close = function () {
        this.root.hidden = true;
        this.input.setAttribute('aria-expanded', 'false');
        this.input.removeAttribute('aria-activedescendant');
        this.active = -1;
    };

    SuggestionList.prototype.clear = function () {
        this.items = [];
        this.list.textContent = '';
        this.state.textContent = '';
        this.state.removeAttribute('data-state');
        this.close();
    };

    SuggestionList.prototype.announce = function (text) {
        this.live.textContent = text || '';
    };

    SuggestionList.prototype.showItems = function (items) {
        var self = this,
            i18n = this.options.i18n;

        this.items = items;
        this.active = -1;
        this.list.textContent = '';
        this.state.textContent = '';
        this.state.removeAttribute('data-state');
        this.root.classList.remove(B + '__dropdown--message');

        items.forEach(function (item, index) {
            var option = el('li', B + '__option', {
                    id: self.id + '-option-' + index,
                    role: 'option',
                    'aria-selected': 'false',
                    'data-index': String(index)
                }),
                main = el('span', B + '__main'),
                secondary;

            main.appendChild(highlighted(item.mainText, item.mainMatches));
            option.appendChild(main);
            if (item.secondaryText) {
                secondary = el('span', B + '__secondary');
                secondary.appendChild(document.createTextNode(item.secondaryText));
                option.appendChild(secondary);
            }
            self.list.appendChild(option);
        });

        this.footer.hidden = false;
        this.open();
        this.announce(items.length === 1 ? i18n.resultsOne : i18n.resultsMany.replace('%1', String(items.length)));
    };

    /** @param {string} kind loading | noResults | error */
    SuggestionList.prototype.showMessage = function (kind) {
        var text = this.options.i18n[kind] || '';

        this.items = [];
        this.list.textContent = '';
        this.state.textContent = text;
        this.state.setAttribute('data-state', kind);
        this.root.classList.add(B + '__dropdown--message');
        this.footer.hidden = kind !== 'noResults';
        this.open();
        if (kind !== 'loading') {
            this.announce(text);
        }
    };

    SuggestionList.prototype.setActive = function (index, scroll) {
        var options = this.list.children,
            i;

        if (!options.length) {
            return;
        }
        this.active = index;
        for (i = 0; i < options.length; i++) {
            options[i].setAttribute('aria-selected', i === index ? 'true' : 'false');
            options[i].classList.toggle(B + '__option--active', i === index);
        }
        if (index >= 0) {
            this.input.setAttribute('aria-activedescendant', options[index].id);
            if (scroll && options[index].scrollIntoView) {
                options[index].scrollIntoView({block: 'nearest'});
            }
        } else {
            this.input.removeAttribute('aria-activedescendant');
        }
    };

    SuggestionList.prototype.move = function (delta) {
        var count = this.items.length,
            next;

        if (!count) {
            return;
        }
        if (!this.isOpen()) {
            this.open();
        }
        next = this.active + delta;
        if (next >= count) {
            next = 0;
        } else if (next < 0) {
            next = count - 1;
        }
        this.setActive(next, true);
    };

    SuggestionList.prototype.getActiveItem = function () {
        return this.active >= 0 ? this.items[this.active] : null;
    };

    SuggestionList.prototype.destroy = function () {
        this.root.removeEventListener('mousedown', this.onPointerDown);
        this.root.removeEventListener('click', this.onClick);
        this.root.removeEventListener('mousemove', this.onHover);
        [this.root, this.live].forEach(function (node) {
            if (node.parentNode) {
                node.parentNode.removeChild(node);
            }
        });
        ['role', 'aria-autocomplete', 'aria-expanded', 'aria-controls', 'aria-activedescendant'].forEach(function (name) {
            this.input.removeAttribute(name);
        }, this);
    };

    return SuggestionList;
}));
