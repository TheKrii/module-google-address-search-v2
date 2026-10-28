/**
 * Copyright © Vaimo Group. All rights reserved.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PlacesClient = require('../../view/frontend/web/js/core/places-client');

function prediction(id, text) {
    return {
        placeId: id,
        text: {text: text},
        mainText: {text: text, matches: [{startOffset: 0, endOffset: 3}]},
        secondaryText: {text: 'Riga, Latvia'},
        toPlace() {
            const place = {
                fetchFields: async (request) => {
                    place.requested = request.fields;
                    place.addressComponents = [{longText: 'Latvia', shortText: 'LV', types: ['country']}];
                },
                token: this.token
            };
            fake.lastPlace = place;

            return place;
        }
    };
}

const fake = {
    requests: [],
    response: null,
    error: null,
    lastPlace: null,
    places: {
        AutocompleteSessionToken: class {
            constructor() {
                this.id = Math.random();
            }
        },
        AutocompleteSuggestion: {
            fetchAutocompleteSuggestions: async (request) => {
                fake.requests.push(request);
                if (fake.error) {
                    throw fake.error;
                }

                return fake.response(request);
            }
        }
    }
};

function client(options = {}) {
    return new PlacesClient(Object.assign({
        apiKey: 'test',
        maxSuggestions: 5,
        sessionTimeoutMs: 180000,
        skipDeadPrefixes: true,
        primaryTypes: ['street_address'],
        language: 'lv',
        region: 'lv',
        loader: async () => fake.places
    }, options));
}

test.beforeEach(() => {
    PlacesClient.resetSharedState();
    fake.requests = [];
    fake.error = null;
    fake.response = (request) => ({
        suggestions: [
            {placePrediction: prediction('a', request.input + ' 1')},
            {queryPrediction: {text: {text: 'ignored'}}},
            {placePrediction: prediction('b', request.input + ' 2')}
        ]
    });
});

test('sends a restricted, typed request with one session token and maps predictions', async () => {
    const c = client();
    const items = await c.suggest('  Brivibas ', ['LV']);
    await c.suggest('Brivibas iela', ['LV']);

    assert.equal(items.length, 2);
    assert.equal(items[0].mainText, 'Brivibas 1');
    assert.deepEqual(items[0].mainMatches, [{start: 0, end: 3}]);
    assert.equal(fake.requests[0].input, 'Brivibas');
    assert.deepEqual(fake.requests[0].includedRegionCodes, ['LV']);
    assert.deepEqual(fake.requests[0].includedPrimaryTypes, ['street_address']);
    assert.equal(fake.requests[0].language, 'lv');
    assert.equal(fake.requests[0].sessionToken, fake.requests[1].sessionToken);
    assert.equal(c.stats.sessions, 1);
});

test('answers identical input from memory within a session', async () => {
    const c = client();

    await c.suggest('Brivibas', ['LV']);
    await c.suggest('brivibas ', ['LV']);
    await c.suggest('Brivibas', ['EE']);

    assert.equal(fake.requests.length, 2);
    assert.equal(c.stats.cacheHits, 1);
});

test('does not resend input extending a query without results', async () => {
    const c = client();

    fake.response = () => ({suggestions: []});
    await c.suggest('zzzq', ['LV']);
    const items = await c.suggest('zzzqx', ['LV']);

    assert.deepEqual(items, []);
    assert.equal(fake.requests.length, 1);
    assert.equal(c.stats.deadPrefixSkips, 1);
});

test('details request only addressComponents and conclude the session', async () => {
    const c = client();
    const [first] = await c.suggest('Brivibas', ['LV']);
    const components = await c.details(first);

    assert.deepEqual(fake.lastPlace.requested, ['addressComponents']);
    assert.deepEqual(components, [{long: 'Latvia', short: 'LV', types: ['country']}]);

    await c.suggest('Brivibas', ['LV']);
    assert.equal(fake.requests.length, 2, 'cache is cleared with the session');
    assert.notEqual(fake.requests[0].sessionToken, fake.requests[1].sessionToken);
    assert.equal(c.stats.sessions, 2);
});

test('starts a new session after the idle timeout', async () => {
    const c = client({sessionTimeoutMs: 1000});

    await c.suggest('Brivibas', ['LV']);
    c.lastActivity -= 5000;
    await c.suggest('Brivibas', ['LV']);

    assert.equal(fake.requests.length, 2);
    assert.notEqual(fake.requests[0].sessionToken, fake.requests[1].sessionToken);
});

test('auth errors disable all clients on the page without further requests', async () => {
    fake.error = new Error('REQUEST_DENIED: API key AIzaSyDUMMYDUMMYDUMMYDUMMYDUMMY12345678 is not authorized');
    await assert.rejects(client().suggest('Brivibas', []), (error) => {
        assert.equal(error.kind, 'fatal');
        assert.doesNotMatch(error.message, /AIza/);

        return true;
    });

    fake.error = null;
    await assert.rejects(client().suggest('Other', []), {kind: 'fatal'});
    assert.equal(fake.requests.length, 1);
});

test('quota errors back off before sending again', async () => {
    const c = client();

    fake.error = Object.assign(new Error('Quota exceeded'), {code: 'RESOURCE_EXHAUSTED'});
    await assert.rejects(c.suggest('Brivibas', []), {kind: 'quota'});
    fake.error = null;
    await assert.rejects(c.suggest('Brivibas iela', []), {kind: 'quota'});

    assert.equal(fake.requests.length, 1);
    assert.equal(c.availability(), 'quota');
});

test('network errors are transient', async () => {
    fake.error = new TypeError('Failed to fetch');
    await assert.rejects(client().suggest('Brivibas', []), {kind: 'transient'});
    assert.equal(client().availability(), 'ok');
});
