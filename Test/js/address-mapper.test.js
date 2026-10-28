/**
 * Copyright © Vaimo Group. All rights reserved.
 *
 * Run: node --test Test/js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mapper = require('../../view/frontend/web/js/core/address-mapper');

const RIGA = [
    {long: '12', short: '12', types: ['street_number']},
    {long: 'Brīvības iela', short: 'Brīvības iela', types: ['route']},
    {long: 'Rīga', short: 'Rīga', types: ['locality', 'political']},
    {long: 'LV-1010', short: 'LV-1010', types: ['postal_code']},
    {long: 'Latvia', short: 'LV', types: ['country', 'political']}
];

const DEFAULT_ROWS = [
    {form: '', countries: [], field: 'street.0', template: '{route} {street_number}'},
    {form: '', countries: ['US', 'GB'], field: 'street.0', template: '{street_number} {route}'},
    {form: '', countries: [], field: 'street.1', template: '{subpremise}'},
    {form: '', countries: [], field: 'city', template: '{locality|postal_town}'},
    {form: '', countries: [], field: 'postcode', template: '{postal_code}'},
    {form: '', countries: [], field: 'country_id', template: '{country:short}'},
    {form: '', countries: [], field: 'region', template: '{administrative_area_level_1}'}
];

function byTarget(result) {
    return Object.fromEntries(result.fields.map((f) => [f.target, f.value]));
}

test('maps a complete address with country-specific street order', () => {
    const result = mapper.map(RIGA, DEFAULT_ROWS, {form: 'customer_address'});

    assert.equal(result.country, 'LV');
    assert.deepEqual(byTarget(result), {
        'street.0': 'Brīvības iela 12',
        'street.1': '',
        city: 'Rīga',
        postcode: 'LV-1010',
        country_id: 'LV',
        region: ''
    });
});

test('number-first countries use the more specific row', () => {
    const us = [
        {long: '1600', short: '1600', types: ['street_number']},
        {long: 'Amphitheatre Parkway', short: 'Amphitheatre Pkwy', types: ['route']},
        {long: 'California', short: 'CA', types: ['administrative_area_level_1']},
        {long: 'United States', short: 'US', types: ['country']}
    ];
    const result = mapper.map(us, DEFAULT_ROWS, {form: 'checkout_shipping'});
    const region = result.fields.find((f) => f.target === 'region');

    assert.equal(byTarget(result)['street.0'], '1600 Amphitheatre Parkway');
    assert.equal(region.value, 'California');
    assert.equal(region.alt, 'CA');
});

test('form-specific rows beat generic rows, form + country beats form', () => {
    const rows = [
        {form: '', countries: [], field: 'city', template: '{locality}'},
        {form: 'checkout_billing', countries: [], field: 'city', template: '{postal_code}'},
        {form: 'checkout_billing', countries: ['LV'], field: 'city', template: '{country}'},
        {form: 'customer_address', countries: ['LV'], field: 'city', template: '{route}'}
    ];

    assert.equal(byTarget(mapper.map(RIGA, rows, {form: 'checkout_shipping'})).city, 'Rīga');
    assert.equal(byTarget(mapper.map(RIGA, rows, {form: 'checkout_billing'})).city, 'Latvia');
});

test('falls back through alternatives and cleans up missing parts', () => {
    const uk = [
        {long: 'London', short: 'London', types: ['postal_town']},
        {long: 'Baker Street', short: 'Baker St', types: ['route']}
    ];
    const index = mapper.indexComponents(uk);

    assert.equal(mapper.render('{locality|postal_town}', index), 'London');
    assert.equal(mapper.render('{street_number} {route}', index), 'Baker Street');
    assert.equal(mapper.render('{route}, {street_number}', index), 'Baker Street');
    assert.equal(mapper.render('{subpremise}/{street_number}', index), '');
    assert.equal(mapper.render('{route:short}', index), 'Baker St');
});

test('returns no fields for an empty mapping and tolerates empty components', () => {
    assert.deepEqual(mapper.map([], DEFAULT_ROWS, {form: 'x'}).fields.map((f) => f.value).filter(Boolean), []);
    assert.deepEqual(mapper.map(RIGA, [], {form: 'x'}).fields, []);
});

test('matchOption matches by value, then label, ignoring case and diacritics', () => {
    const options = [
        {value: '', label: 'Please select'},
        {value: '12', label: 'California'},
        {value: '57', label: 'Rīga'}
    ];

    assert.equal(mapper.matchOption(options, 'california', 'CA').value, '12');
    assert.equal(mapper.matchOption(options, 'Riga', '').value, '57');
    assert.equal(mapper.matchOption([{value: 'LV', label: 'Latvia'}], 'LV', 'LV').value, 'LV');
    assert.equal(mapper.matchOption(options, 'Texas', 'TX'), null);
    assert.equal(mapper.matchOption(options, '', ''), null);
});

test('coordinates: location is only requested when a mapping uses it, negative values survive', () => {
    const rows = [{form: '', countries: [], field: 'latitude', template: '{latitude}'}];

    assert.deepEqual(mapper.detailFields(DEFAULT_ROWS), ['addressComponents']);
    assert.deepEqual(mapper.detailFields(rows), ['addressComponents', 'location']);
    assert.deepEqual(mapper.detailFields([{template: '{locality|longitude}'}]), ['addressComponents', 'location']);

    const index = mapper.indexComponents([
        {long: '-33.9213840', short: '-33.9213840', types: ['latitude']},
        {long: '18.4181250', short: '18.4181250', types: ['longitude']}
    ]);

    assert.equal(mapper.render('{latitude}', index), '-33.9213840');
    assert.equal(mapper.render('{latitude}, {longitude}', index), '-33.9213840, 18.4181250');
    assert.equal(mapper.render('- {route}', index), '');
});

test('default South African mapping (etc/config.xml): unit/number street, suburb on line 2', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const xml = fs.readFileSync(path.join(__dirname, '../../etc/config.xml'), 'utf8');
    const raw = JSON.parse(/<field_mapping>(.*)<\/field_mapping>/s.exec(xml)[1]);
    const rows = Object.values(raw).map((row) => ({
        form: row.form,
        countries: row.countries ? row.countries.split(',') : [],
        field: row.field,
        template: row.template
    }));
    const capeTown = [
        {long: '4', short: '4', types: ['subpremise']},
        {long: '10', short: '10', types: ['street_number']},
        {long: 'Bree Street', short: 'Bree St', types: ['route']},
        {long: 'Cape Town City Centre', short: 'Cape Town City Centre', types: ['sublocality_level_1', 'sublocality']},
        {long: 'Cape Town', short: 'Cape Town', types: ['locality']},
        {long: 'Western Cape', short: 'WC', types: ['administrative_area_level_1']},
        {long: 'South Africa', short: 'ZA', types: ['country']},
        {long: '8001', short: '8001', types: ['postal_code']}
    ];
    const za = byTarget(mapper.map(capeTown, rows, {form: 'checkout_shipping'}));

    assert.equal(za['street.0'], '4/10 Bree Street');
    assert.equal(za['street.1'], 'Cape Town City Centre');
    assert.equal(za.city, 'Cape Town');
    assert.equal(za.country_id, 'ZA');
    assert.equal(za.region, 'Western Cape');
    assert.equal(za.postcode, '8001');

    // Without a unit the separator disappears
    assert.equal(byTarget(mapper.map(capeTown.slice(1), rows, {form: 'x'}))['street.0'], '10 Bree Street');

    // Number-after-street countries keep their own order
    const riga = byTarget(mapper.map(RIGA, rows, {form: 'x'}));
    assert.equal(riga['street.0'], 'Brīvības iela 12');
});
