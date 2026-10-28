/**
 * Copyright © Vaimo Group. All rights reserved.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SearchController = require('../../view/frontend/web/js/core/search-controller');

class FakeInput extends EventTarget {
    constructor() {
        super();
        this.value = '';
    }

    type(value) {
        this.value = value;
        this.dispatchEvent(new Event('input'));
    }

    key(name) {
        const event = new Event('keydown', {cancelable: true});

        event.key = name;
        this.dispatchEvent(event);

        return event;
    }
}

function fakeList() {
    return {
        items: [],
        active: -1,
        open: false,
        messages: [],
        showItems(items) {
            this.items = items;
            this.open = true;
        },
        showMessage(kind) {
            this.messages.push(kind);
            this.open = true;
        },
        clear() {
            this.items = [];
            this.open = false;
        },
        close() {
            this.open = false;
        },
        isOpen() {
            return this.open;
        },
        hasItems() {
            return this.items.length > 0;
        },
        move(delta) {
            this.active = (this.active + delta + this.items.length) % this.items.length;
        },
        getActiveItem() {
            return this.items[this.active] || null;
        }
    };
}

function setup(overrides = {}) {
    const input = new FakeInput();
    const list = fakeList();
    const calls = [];
    const pending = [];
    const client = {
        suggest(value) {
            calls.push(value);

            return new Promise((resolve, reject) => pending.push({value, resolve, reject}));
        }
    };
    const picked = [];
    const controller = new SearchController(input, Object.assign({
        client,
        list,
        minChars: 3,
        debounceMs: 300,
        minIntervalMs: 0,
        getRegions: () => ['LV'],
        onPick: (item) => {
            picked.push(item);
            input.value = 'Brivibas iela 12';

            return Promise.resolve();
        },
        onCleared: () => picked.push('cleared')
    }, overrides));

    return {input, list, calls, pending, picked, controller};
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Minimal fake clock (node:test mock timers in Node 21 throw on clearTimeout(null)). */
function fakeClock(start = 0) {
    const real = {setTimeout, clearTimeout, now: Date.now};
    let now = start;
    let id = 0;
    let timers = [];

    global.setTimeout = (fn, delay) => {
        timers.push({id: ++id, at: now + Math.max(0, delay || 0), fn});

        return id;
    };
    global.clearTimeout = (timerId) => {
        timers = timers.filter((timer) => timer.id !== timerId);
    };
    Date.now = () => now;

    return {
        tick(ms) {
            const target = now + ms;

            for (;;) {
                const due = timers.filter((timer) => timer.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0];

                if (!due) {
                    break;
                }
                timers = timers.filter((timer) => timer !== due);
                now = due.at;
                due.fn();
            }
            now = target;
        },
        restore() {
            global.setTimeout = real.setTimeout;
            global.clearTimeout = real.clearTimeout;
            Date.now = real.now;
        }
    };
}

let clock;

test.beforeEach(() => {
    clock = fakeClock(10000);
});

test.afterEach(() => clock.restore());

test('waits for the minimum length and debounces typing into one request', () => {
    const {input, calls} = setup();

    input.type('B');
    input.type('Br');
    clock.tick(1000);
    assert.equal(calls.length, 0, 'below minimum characters');

    input.type('Bri');
    clock.tick(100);
    input.type('Briv');
    clock.tick(100);
    input.type('Brivi');
    clock.tick(299);
    assert.equal(calls.length, 0, 'still debouncing');
    clock.tick(1);
    assert.deepEqual(calls, ['Brivi']);
});

test('ignores out-of-order responses from earlier input', async () => {
    const {input, list, pending} = setup();

    input.type('Briv');
    clock.tick(300);
    input.type('Brivibas');
    clock.tick(300);

    pending[1].resolve([{mainText: 'new'}]);
    await flush();
    pending[0].resolve([{mainText: 'old'}]);
    await flush();

    assert.deepEqual(list.items, [{mainText: 'new'}]);
});

test('clearing the input cancels pending work and reports the clear', async () => {
    const {input, list, calls, pending, picked} = setup();

    input.type('Briv');
    clock.tick(300);
    input.type('');
    pending[0].resolve([{mainText: 'late'}]);
    await flush();
    clock.tick(1000);

    assert.equal(calls.length, 1);
    assert.deepEqual(list.items, []);
    assert.deepEqual(picked, ['cleared']);
});

test('enforces the minimum interval between requests', () => {
    const {input, calls} = setup({debounceMs: 0, minIntervalMs: 1000});

    input.type('Briv');
    clock.tick(0);
    input.type('Brivi');
    clock.tick(500);
    assert.equal(calls.length, 1);
    clock.tick(500);
    assert.equal(calls.length, 2);
});

test('keyboard selection picks the active item and prevents form submit', async () => {
    const {input, pending, picked} = setup();

    input.type('Briv');
    clock.tick(300);
    pending[0].resolve([{mainText: 'one'}, {mainText: 'two'}]);
    await flush();

    assert.equal(input.key('ArrowDown').defaultPrevented, true);
    input.key('ArrowDown');
    assert.equal(input.key('Enter').defaultPrevented, true);
    await flush();

    assert.deepEqual(picked, [{mainText: 'two'}]);
});

test('edits after a selection do not trigger new searches until the text diverges', async () => {
    const {input, pending, calls, controller} = setup();

    input.type('Briv');
    clock.tick(300);
    pending[0].resolve([{mainText: 'one'}]);
    await flush();
    await controller.pick({mainText: 'one'});

    input.type('Brivibas iela 12a');
    clock.tick(1000);
    assert.equal(calls.length, 1, 'appending to the selected street is free');

    input.type('Kr. Valdemara');
    clock.tick(300);
    assert.equal(calls.length, 2);
});

test('fatal errors turn the field back into a plain input', async () => {
    const {input, pending, calls} = setup();

    input.type('Briv');
    clock.tick(300);
    pending[0].reject(Object.assign(new Error('denied'), {kind: 'fatal'}));
    await flush();

    input.type('Brivibas');
    clock.tick(1000);
    assert.equal(calls.length, 1);
});

test('transient errors show the error state and keep searching', async () => {
    const {input, list, pending, calls} = setup();

    input.type('Briv');
    clock.tick(300);
    pending[0].reject(Object.assign(new Error('offline'), {kind: 'transient'}));
    await flush();
    assert.deepEqual(list.messages.slice(-1), ['error']);

    input.type('Brivibas');
    clock.tick(300);
    assert.equal(calls.length, 2);
});

test('populating the field during selection does not start a new search', async () => {
    const {input, pending, calls, controller} = setup({
        onPick: () => {
            // DOM adapters dispatch input/change events when they write the street field
            input.type('Loop Street 20');

            return Promise.resolve();
        }
    });

    input.type('20 Loop');
    clock.tick(300);
    pending[0].resolve([{mainText: 'Loop Street'}]);
    await flush();
    await controller.pick({mainText: 'Loop Street'});
    clock.tick(1000);

    assert.equal(calls.length, 1);
});
