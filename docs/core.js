/**
 * core.js — Pure helper functions for the Shopping List app.
 * ES module; imported by app.js (browser) and tests/core.test.js (Node).
 * No DOM, no Vue, no side-effects.
 */

// ── Item text parsing ──────────────────────────────────────────────────────

/**
 * Parse quantity/unit prefix from item text.
 * e.g. "2kg apples" → { quantity: 2, unit: "kg", name: "apples" }
 *      "3 eggs"     → { quantity: 3, unit: null,  name: "eggs"   }
 *      "milk"       → { quantity: null, unit: null, name: "milk" }
 *
 * @param {string} text
 * @returns {{ quantity: number|null, unit: string|null, name: string }}
 */
export function parseItemText(text) {
    const m = text.match(/^(\d+(?:\.\d+)?)(g|kg|ml|l)?\s+(.+)$/i);
    if (m) {
        return {
            quantity: parseFloat(m[1]),
            unit: m[2] ? m[2].toLowerCase() : null,
            name: m[3],
        };
    }
    return { quantity: null, unit: null, name: text };
}

// ── Raw price string parsing ───────────────────────────────────────────────

/**
 * Parse a compact price/amount string like "5/1kg" or "2.5/500g".
 *
 * @param {string} raw
 * @returns {{ price: number, amount: number, unit: string|null } | null}
 */
export function parsePriceRaw(raw) {
    if (!raw) return null;
    const m = raw.trim().match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)(g|kg|ml|l)?$/i);
    if (!m) return null;
    return {
        price: parseFloat(m[1]),
        amount: parseFloat(m[2]),
        unit: m[3] ? m[3].toLowerCase() : null,
    };
}

// ── Price normalization ────────────────────────────────────────────────────

/**
 * Normalize a price to €/kg or €/l for display.
 * Returns null if the unit is unknown or inputs are invalid.
 *
 * @param {number|string} price
 * @param {number|string} amount
 * @param {string|null}   unit
 * @returns {string|null}  e.g. "5€/kg"
 */
export function normalizePrice(price, amount, unit) {
    price = parseFloat(price);
    amount = parseFloat(amount);
    if (!price || !amount || isNaN(price) || isNaN(amount) || amount === 0) return null;
    let perUnit, label;
    if (unit === 'g') { perUnit = price / amount * 1000; label = 'kg'; }
    else if (unit === 'kg') { perUnit = price / amount; label = 'kg'; }
    else if (unit === 'ml') { perUnit = price / amount * 1000; label = 'l'; }
    else if (unit === 'l') { perUnit = price / amount; label = 'l'; }
    else return null;
    const rounded = Math.round(perUnit * 100) / 100;
    return `${rounded}\u20ac/${label}`;
}

// ── Date helper ───────────────────────────────────────────────────────────

/**
 * @returns {string} Today's date as "YYYY-MM-DD"
 */
export function today() {
    return new Date().toISOString().slice(0, 10);
}

// ── Checklist text rendering & parsing ───────────────────────────────────

/**
 * Render an items array to the checklist textarea format.
 * Pure function — does not mutate the input.
 *
 * @param {Array<{text: string, checked: boolean}>} items
 * @returns {string}
 */
export function renderText(items) {
    return items
        .map(i => (i.checked ? '- [x] ' : '- [ ] ') + i.text)
        .join('\n');
}

/**
 * Parse raw checklist text back into items.
 * Reuses existing IDs from existingItems where text matches (dedup-safe).
 * Pure function — does not mutate any input.
 *
 * @param {string} raw
 * @param {Array<{id: number, text: string}>} existingItems
 * @param {number} nextIdStart
 * @returns {{ items: Array<{id: number, text: string, checked: boolean}>, nextId: number }}
 */
export function parseTextLines(raw, existingItems, nextIdStart) {
    const checkedRe = /^- \[x\] (.*)$/i;
    const uncheckedRe = /^- \[ \] (.*)$/;

    // Build a map of text → queue of existing ids (preserves duplicates)
    const idQueues = {};
    for (const item of existingItems) {
        if (!idQueues[item.text]) idQueues[item.text] = [];
        idQueues[item.text].push(item.id);
    }

    // Guard: no ID may be assigned twice
    const usedIds = new Set();
    let nextId = nextIdStart;

    const newItems = [];
    for (const line of raw.split('\n')) {
        const trimmed = line.trimEnd();
        if (trimmed === '') continue;

        let checked = false;
        let text = trimmed;
        const cm = trimmed.match(checkedRe);
        const um = trimmed.match(uncheckedRe);
        if (cm) { checked = true; text = cm[1]; }
        else if (um) { checked = false; text = um[1]; }

        // Reuse queued id for this text, but skip any already used
        const queue = idQueues[text];
        let id = null;
        while (queue && queue.length > 0) {
            const candidate = queue.shift();
            if (!usedIds.has(candidate)) { id = candidate; break; }
        }
        if (id === null) id = nextId++;
        usedIds.add(id);

        newItems.push({ id, text, checked });
    }
    return { items: newItems, nextId };
}

// ── Price data text view rendering & parsing ─────────────────────────────

/**
 * Render a priceData object to the canonical editable text format.
 *
 * Format:
 *   - <name>
 *     - <date> <store> <price>€/<amount><unit> <info>
 *
 * store is omitted (left empty string) and info is omitted if empty.
 * Items sorted alphabetically; entries sorted by date descending.
 *
 * @param {Object} priceData  e.g. { "apples": [{ date, store, price, amount, amountUnit, info }] }
 * @returns {string}
 */
export function renderPriceViewText(priceData) {
    const lines = [];
    const keys = Object.keys(priceData).sort();
    for (const name of keys) {
        const entries = priceData[name];
        if (!entries || entries.length === 0) continue;
        lines.push(`- ${name}`);
        for (const e of entries) {
            const store = e.store || '';
            const info = e.info || '';
            const unit = e.amountUnit || '';
            let line = `  - ${e.date} ${store} ${e.price}\u20ac/${e.amount}${unit}`;
            if (info) line += ` ${info}`;
            lines.push(line);
        }
    }
    return lines.join('\n');
}

/**
 * Parse the editable price view textarea back into a priceData object.
 * Silently skips unrecognised lines.
 * Fully replaces any previous priceData (caller is responsible for saving).
 *
 * Entry line format:
 *   <whitespace>- <date> <store> <price>€/<amount>[unit] [info...]
 *
 * @param {string} text
 * @returns {Object}  priceData map: { "<name-lower>": [ Entry ] }
 */
export function parsePriceViewText(text) {
    const itemRe = /^-\s+(.+)$/;
    const entryRe = /^\s*-\s+(\d{4}-\d{2}-\d{2})\s+(\S+)\s+(\d+(?:\.\d+)?)\u20ac\/(\d+(?:\.\d+)?)(g|kg|ml|l)?\s*(.*)$/i;

    const priceData = {};
    let currentName = null;

    for (const rawLine of text.split('\n')) {
        const line = rawLine.trimEnd();
        if (line === '') continue;

        const em = line.match(entryRe);
        if (em && currentName !== null) {
            if (!priceData[currentName]) priceData[currentName] = [];
            priceData[currentName].push({
                date: em[1],
                store: em[2],
                price: parseFloat(em[3]),
                priceUnit: '€',
                amount: parseFloat(em[4]),
                amountUnit: em[5] ? em[5].toLowerCase() : null,
                info: em[6].trim(),
            });
            continue;
        }

        const nm = line.match(itemRe);
        if (nm) {
            currentName = nm[1].toLowerCase();
            continue;
        }

        // Unrecognised line — skip silently; stay in current item context.
    }

    return priceData;
}
