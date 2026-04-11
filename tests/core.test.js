/**
 * tests/core.test.js
 * Unit tests for pure functions in docs/core.js.
 * Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    parseItemText,
    parsePriceRaw,
    normalizePrice,
    today,
    renderText,
    parseTextLines,
    renderPriceViewText,
    parsePriceViewText,
    getItemPriceInfo,
} from '../docs/core.js';

// ── parseItemText ─────────────────────────────────────────────────────────

test('parseItemText: quantity + unit', () => {
    assert.deepEqual(parseItemText('2kg apples'), { quantity: 2, unit: 'kg', name: 'apples' });
    assert.deepEqual(parseItemText('500g flour'), { quantity: 500, unit: 'g', name: 'flour' });
    assert.deepEqual(parseItemText('1.5l milk'), { quantity: 1.5, unit: 'l', name: 'milk' });
    assert.deepEqual(parseItemText('250ml water'), { quantity: 250, unit: 'ml', name: 'water' });
});

test('parseItemText: quantity without unit', () => {
    assert.deepEqual(parseItemText('3 eggs'), { quantity: 3, unit: null, name: 'eggs' });
    assert.deepEqual(parseItemText('12 rolls'), { quantity: 12, unit: null, name: 'rolls' });
});

test('parseItemText: no quantity', () => {
    assert.deepEqual(parseItemText('milk'), { quantity: null, unit: null, name: 'milk' });
    assert.deepEqual(parseItemText('bread rolls'), { quantity: null, unit: null, name: 'bread rolls' });
});

test('parseItemText: unit matching is case-insensitive', () => {
    assert.deepEqual(parseItemText('2KG apples'), { quantity: 2, unit: 'kg', name: 'apples' });
    assert.deepEqual(parseItemText('500G flour'), { quantity: 500, unit: 'g', name: 'flour' });
});

test('parseItemText: decimal quantity', () => {
    assert.deepEqual(parseItemText('0.5kg butter'), { quantity: 0.5, unit: 'kg', name: 'butter' });
});

// ── parsePriceRaw ─────────────────────────────────────────────────────────

test('parsePriceRaw: valid inputs', () => {
    assert.deepEqual(parsePriceRaw('5/1kg'), { price: 5, amount: 1, unit: 'kg' });
    assert.deepEqual(parsePriceRaw('2.5/500g'), { price: 2.5, amount: 500, unit: 'g' });
    assert.deepEqual(parsePriceRaw('3/1l'), { price: 3, amount: 1, unit: 'l' });
    assert.deepEqual(parsePriceRaw('1.2/250ml'), { price: 1.2, amount: 250, unit: 'ml' });
});

test('parsePriceRaw: plain number amount (no unit)', () => {
    assert.deepEqual(parsePriceRaw('4/6'), { price: 4, amount: 6, unit: null });
});

test('parsePriceRaw: invalid inputs return null', () => {
    assert.equal(parsePriceRaw(''), null);
    assert.equal(parsePriceRaw(null), null);
    assert.equal(parsePriceRaw('abc'), null);
    assert.equal(parsePriceRaw('5'), null);   // no slash + amount
    assert.equal(parsePriceRaw('5/'), null);   // missing amount
    assert.equal(parsePriceRaw('/1kg'), null);   // missing price
    assert.equal(parsePriceRaw('5/1 kg'), null);   // space before unit
});

test('parsePriceRaw: unit matching is case-insensitive', () => {
    assert.deepEqual(parsePriceRaw('5/1KG'), { price: 5, amount: 1, unit: 'kg' });
});

// ── normalizePrice ────────────────────────────────────────────────────────

test('normalizePrice: kg identity', () => {
    assert.equal(normalizePrice(5, 1, 'kg'), '5€/kg');
    assert.equal(normalizePrice(3, 2, 'kg'), '1.5€/kg');
});

test('normalizePrice: g → kg conversion', () => {
    assert.equal(normalizePrice(1, 200, 'g'), '5€/kg');
    assert.equal(normalizePrice(0.5, 500, 'g'), '1€/kg');
});

test('normalizePrice: l identity', () => {
    assert.equal(normalizePrice(2, 1, 'l'), '2€/l');
});

test('normalizePrice: ml → l conversion', () => {
    assert.equal(normalizePrice(1.5, 500, 'ml'), '3€/l');
});

test('normalizePrice: null unit (no unit) → €/pc', () => {
    assert.equal(normalizePrice(4, 2, null), '2€/pc');
    assert.equal(normalizePrice(10, 5, null), '2€/pc');
    assert.equal(normalizePrice(3, 1, null), '3€/pc');
});

test('normalizePrice: unknown unit returns null', () => {
    assert.equal(normalizePrice(5, 1, 'lb'), null);
});

test('normalizePrice: zero/invalid inputs return null', () => {
    assert.equal(normalizePrice(0, 1, 'kg'), null);
    assert.equal(normalizePrice(5, 0, 'kg'), null);
    assert.equal(normalizePrice(NaN, 1, 'kg'), null);
});

// ── today ─────────────────────────────────────────────────────────────────

test('today: returns YYYY-MM-DD format', () => {
    assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
});

// ── renderText ────────────────────────────────────────────────────────────

test('renderText: unchecked items', () => {
    const items = [
        { id: 1, text: '2kg apples', checked: false },
        { id: 2, text: 'milk', checked: false },
    ];
    assert.equal(renderText(items), '- [ ] 2kg apples\n- [ ] milk');
});

test('renderText: checked items', () => {
    const items = [{ id: 1, text: 'milk', checked: true }];
    assert.equal(renderText(items), '- [x] milk');
});

test('renderText: mixed', () => {
    const items = [
        { id: 1, text: 'apples', checked: false },
        { id: 2, text: 'milk', checked: true },
    ];
    assert.equal(renderText(items), '- [ ] apples\n- [x] milk');
});

test('renderText: empty array', () => {
    assert.equal(renderText([]), '');
});

// ── parseTextLines ────────────────────────────────────────────────────────

test('parseTextLines: basic unchecked + checked', () => {
    const raw = '- [ ] apples\n- [x] milk';
    const { items, nextId } = parseTextLines(raw, [], 1);
    assert.equal(items.length, 2);
    assert.equal(items[0].text, 'apples');
    assert.equal(items[0].checked, false);
    assert.equal(items[1].text, 'milk');
    assert.equal(items[1].checked, true);
    assert.equal(nextId, 3);
});

test('parseTextLines: lines without prefix imported as unchecked', () => {
    const { items } = parseTextLines('plain line', [], 1);
    assert.equal(items.length, 1);
    assert.equal(items[0].text, 'plain line');
    assert.equal(items[0].checked, false);
});

test('parseTextLines: empty lines are skipped', () => {
    const { items } = parseTextLines('- [ ] a\n\n- [ ] b\n', [], 1);
    assert.equal(items.length, 2);
});

test('parseTextLines: reuses existing IDs by text', () => {
    const existing = [{ id: 42, text: 'apples' }];
    const { items } = parseTextLines('- [ ] apples', existing, 100);
    assert.equal(items[0].id, 42);
});

test('parseTextLines: mints new ID when no existing ID matches', () => {
    const { items } = parseTextLines('- [ ] new item', [], 7);
    assert.equal(items[0].id, 7);
});

test('parseTextLines: no duplicate IDs even with repeated text', () => {
    const raw = '- [ ] apples\n- [ ] apples';
    const { items } = parseTextLines(raw, [], 1);
    assert.equal(items.length, 2);
    assert.notEqual(items[0].id, items[1].id);
});

test('parseTextLines: round-trip with renderText', () => {
    const original = [
        { id: 1, text: '2kg apples', checked: false },
        { id: 2, text: 'milk', checked: true },
        { id: 3, text: '3 eggs', checked: false },
    ];
    const text = renderText(original);
    const { items } = parseTextLines(text, original, 4);
    assert.equal(items.length, original.length);
    for (let i = 0; i < original.length; i++) {
        assert.equal(items[i].id, original[i].id);
        assert.equal(items[i].text, original[i].text);
        assert.equal(items[i].checked, original[i].checked);
    }
});

// ── renderPriceViewText ───────────────────────────────────────────────────

test('renderPriceViewText: empty priceData', () => {
    assert.equal(renderPriceViewText({}), '');
});

test('renderPriceViewText: single item, single entry with store and info', () => {
    const pd = {
        apples: [{ date: '2026-03-28', store: 'spar', price: 10, amount: 1, amountUnit: 'kg', info: 'good brand' }],
    };
    const result = renderPriceViewText(pd);
    assert.equal(result, '- apples\n  - 2026-03-28 spar 10€/1kg good brand');
});

test('renderPriceViewText: entry without info omits trailing space', () => {
    const pd = {
        milk: [{ date: '2026-03-27', store: 'lidl', price: 1.5, amount: 1, amountUnit: 'l', info: '' }],
    };
    const result = renderPriceViewText(pd);
    assert.equal(result, '- milk\n  - 2026-03-27 lidl 1.5€/1l');
});

test('renderPriceViewText: items sorted alphabetically', () => {
    const pd = {
        milk: [{ date: '2026-03-27', store: 'spar', price: 1.5, amount: 1, amountUnit: 'l', info: '' }],
        apples: [{ date: '2026-03-28', store: 'lidl', price: 10, amount: 1, amountUnit: 'kg', info: '' }],
    };
    const result = renderPriceViewText(pd);
    assert.ok(result.indexOf('- apples') < result.indexOf('- milk'));
});

test('renderPriceViewText: items with no entries are skipped', () => {
    const pd = { apples: [], milk: [{ date: '2026-03-27', store: 'spar', price: 1.5, amount: 1, amountUnit: 'l', info: '' }] };
    const result = renderPriceViewText(pd);
    assert.ok(!result.includes('apples'));
    assert.ok(result.includes('milk'));
});

// ── parsePriceViewText ────────────────────────────────────────────────────

test('parsePriceViewText: empty string', () => {
    assert.deepEqual(parsePriceViewText(''), {});
});

test('parsePriceViewText: single item, single entry', () => {
    const text = '- apples\n  - 2026-03-28 spar 10€/1kg good brand';
    const pd = parsePriceViewText(text);
    assert.ok(pd.apples);
    assert.equal(pd.apples.length, 1);
    assert.equal(pd.apples[0].date, '2026-03-28');
    assert.equal(pd.apples[0].store, 'spar');
    assert.equal(pd.apples[0].price, 10);
    assert.equal(pd.apples[0].amount, 1);
    assert.equal(pd.apples[0].amountUnit, 'kg');
    assert.equal(pd.apples[0].info, 'good brand');
});

test('parsePriceViewText: entry without info field', () => {
    const text = '- milk\n  - 2026-03-27 lidl 1.5€/1l';
    const pd = parsePriceViewText(text);
    assert.equal(pd.milk[0].info, '');
});

test('parsePriceViewText: multiple items and entries', () => {
    const text = [
        '- apples',
        '  - 2026-03-28 spar 10€/1kg',
        '  - 2026-03-20 lidl 8€/1kg',
        '- milk',
        '  - 2026-03-27 spar 1.5€/1l',
    ].join('\n');
    const pd = parsePriceViewText(text);
    assert.equal(pd.apples.length, 2);
    assert.equal(pd.milk.length, 1);
    assert.equal(pd.apples[0].date, '2026-03-28');
    assert.equal(pd.apples[1].date, '2026-03-20');
});

test('parsePriceViewText: key is lowercased', () => {
    const text = '- Apples\n  - 2026-03-28 spar 10€/1kg';
    const pd = parsePriceViewText(text);
    assert.ok(pd.apples);
    assert.ok(!pd.Apples);
});

test('parsePriceViewText: unrecognised lines are skipped', () => {
    const text = '# header\n- apples\n  garbage line\n  - 2026-03-28 spar 10€/1kg';
    const pd = parsePriceViewText(text);
    assert.equal(pd.apples[0].price, 10);
});

test('parsePriceViewText: round-trip with renderPriceViewText', () => {
    const original = {
        apples: [
            { date: '2026-03-28', store: 'spar', price: 10, amount: 1, amountUnit: 'kg', info: 'organic', priceUnit: '€' },
            { date: '2026-03-20', store: 'lidl', price: 8, amount: 1, amountUnit: 'kg', info: '', priceUnit: '€' },
        ],
        milk: [
            { date: '2026-03-27', store: 'spar', price: 1.5, amount: 1, amountUnit: 'l', info: 'fresh', priceUnit: '€' },
        ],
    };
    const text = renderPriceViewText(original);
    const pd = parsePriceViewText(text);

    assert.equal(pd.apples.length, 2);
    assert.equal(pd.apples[0].date, '2026-03-28');
    assert.equal(pd.apples[0].store, 'spar');
    assert.equal(pd.apples[0].price, 10);
    assert.equal(pd.apples[0].info, 'organic');
    assert.equal(pd.apples[1].info, '');
    assert.equal(pd.milk[0].info, 'fresh');
});

// ── getItemPriceInfo ──────────────────────────────────────────────────────

test('getItemPriceInfo: returns null for unknown item', () => {
    assert.equal(getItemPriceInfo('unknown', {}, 'lidl'), null);
});

test('getItemPriceInfo: returns null when item has no entries', () => {
    assert.equal(getItemPriceInfo('apples', { apples: [] }, 'lidl'), null);
});

test('getItemPriceInfo: returns null when current store has no price', () => {
    const pd = {
        apples: [{ date: '2026-03-28', store: 'spar', price: 10, amount: 1, amountUnit: 'kg', info: '' }],
    };
    assert.equal(getItemPriceInfo('apples', pd, 'lidl'), null);
});

test('getItemPriceInfo: single store returns zero diffs', () => {
    const pd = {
        apples: [{ date: '2026-03-28', store: 'lidl', price: 10, amount: 1, amountUnit: 'kg', info: '' }],
    };
    const result = getItemPriceInfo('apples', pd, 'lidl');
    assert.equal(result.currentPrice, 10);
    assert.equal(result.minDiff, 0);
    assert.equal(result.maxDiff, 0);
});

test('getItemPriceInfo: multiple stores with current cheapest', () => {
    const pd = {
        apples: [
            { date: '2026-03-28', store: 'lidl', price: 8, amount: 1, amountUnit: 'kg', info: '' },
            { date: '2026-03-27', store: 'spar', price: 10, amount: 1, amountUnit: 'kg', info: '' },
        ],
    };
    const result = getItemPriceInfo('apples', pd, 'lidl');
    assert.equal(result.currentPrice, 8);
    assert.equal(result.minDiff, 0);   // we are the cheapest
    assert.equal(result.maxDiff, 2);   // most expensive is 2 more
});

test('getItemPriceInfo: multiple stores with current most expensive', () => {
    const pd = {
        apples: [
            { date: '2026-03-28', store: 'lidl', price: 8, amount: 1, amountUnit: 'kg', info: '' },
            { date: '2026-03-27', store: 'spar', price: 10, amount: 1, amountUnit: 'kg', info: '' },
        ],
    };
    const result = getItemPriceInfo('apples', pd, 'spar');
    assert.equal(result.currentPrice, 10);
    assert.equal(result.minDiff, -2);  // cheapest is 2 less
    assert.equal(result.maxDiff, 0);   // we are the most expensive
});

test('getItemPriceInfo: multiple stores with current in middle', () => {
    const pd = {
        apples: [
            { date: '2026-03-28', store: 'lidl', price: 8, amount: 1, amountUnit: 'kg', info: '' },
            { date: '2026-03-28', store: 'spar', price: 10, amount: 1, amountUnit: 'kg', info: '' },
            { date: '2026-03-28', store: 'other', price: 12, amount: 1, amountUnit: 'kg', info: '' },
        ],
    };
    const result = getItemPriceInfo('apples', pd, 'spar');
    assert.equal(result.currentPrice, 10);
    assert.equal(result.minDiff, -2);  // cheapest is 2 less
    assert.equal(result.maxDiff, 2);   // most expensive is 2 more
});

test('getItemPriceInfo: uses most recent entry per store', () => {
    const pd = {
        apples: [
            { date: '2026-03-28', store: 'lidl', price: 8, amount: 1, amountUnit: 'kg', info: '' },
            { date: '2026-03-20', store: 'lidl', price: 12, amount: 1, amountUnit: 'kg', info: '' },
        ],
    };
    const result = getItemPriceInfo('apples', pd, 'lidl');
    assert.equal(result.currentPrice, 8);  // uses most recent date
});

test('getItemPriceInfo: handles unit conversion', () => {
    const pd = {
        apples: [
            { date: '2026-03-28', store: 'lidl', price: 4, amount: 500, amountUnit: 'g', info: '' },
        ],
    };
    const result = getItemPriceInfo('apples', pd, 'lidl');
    assert.equal(result.currentPrice, 8);  // 4€/500g = 8€/kg
});

test('getItemPriceInfo: item name is case-insensitive', () => {
    const pd = {
        apples: [{ date: '2026-03-28', store: 'lidl', price: 10, amount: 1, amountUnit: 'kg', info: '' }],
    };
    const result = getItemPriceInfo('Apples', pd, 'lidl');
    assert.equal(result.currentPrice, 10);
});
