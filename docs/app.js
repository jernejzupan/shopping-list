/**
 * app.js — Vue 3 application for the Shopping List.
 * ES module; imported by index.html via <script type="module">.
 */

import { createApp, nextTick } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
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
} from './core.js';

const STORAGE_KEY = 'sldata';
const STORE_OPTIONS = ['lidl', 'spar', 'other'];

createApp({
    data() {
        return {
            items: [],            // [{ id, text, checked }]
            textMode: false,
            shoppingMode: false,
            selectedStore: 'lidl',
            priceViewMode: false,  // not persisted
            filterText: '',        // not persisted
            draftText: '',
            priceViewEditText: '', // not persisted; populated on price view open
            _nextId: 1,

            // Inline editing
            editingItemId: null,
            editDraft: '',
            _editOriginal: '',

            // Item selection & undo
            selectedItemId: null,   // transient, not persisted
            undoStack: [],          // array of deep-cloned items snapshots; max 10
            _pressTimer: null,
            _pressStart: null,
            menuOpen: false,

            // Price data: { "<name-lower>": [{ date, store, price, priceUnit, amount, amountUnit, info }] }
            priceData: {},

            // Price modal state
            priceModalItem: null,  // item name string when modal open, null = closed
            priceForm: {
                date: today(),
                store: 'lidl',
                raw: '',      // e.g. "5/1kg"
                info: '',
            },

            // Expose store options to template
            storeOptions: STORE_OPTIONS,
        };
    },

    computed: {
        uncheckedItems() {
            return this.items.filter(i => !i.checked);
        },
        checkedItems() {
            return this.items.filter(i => i.checked);
        },
        filteredUncheckedItems() {
            if (!this.filterText) return this.uncheckedItems;
            const q = this.filterText.toLowerCase();
            return this.uncheckedItems.filter(i => i.text.toLowerCase().includes(q));
        },
        filteredCheckedItems() {
            if (!this.filterText) return this.checkedItems;
            const q = this.filterText.toLowerCase();
            return this.checkedItems.filter(i => i.text.toLowerCase().includes(q));
        },

        /** Current entries for the modal (last 10, already sorted desc) */
        currentPriceEntries() {
            if (!this.priceModalItem) return [];
            const entries = this.priceData[this.priceModalItem.toLowerCase()] || [];
            return entries.slice(0, 10);
        },

        /** Live normalized preview for the add-entry form */
        priceFormNormalized() {
            const p = parsePriceRaw(this.priceForm.raw);
            if (!p) return null;
            return normalizePrice(p.price, p.amount, p.unit);
        },

        /** Currently selected item object, or null */
        selectedItem() {
            if (this.selectedItemId === null) return null;
            return this.items.find(i => i.id === this.selectedItemId) || null;
        },
    },

    watch: {
        textMode(newVal, oldVal) {
            if (oldVal === true && newVal === false) {
                // text → checkbox: parse draft back into items
                const { items, nextId } = parseTextLines(this.draftText, this.items, this._nextId);
                this.items = items;
                this._nextId = nextId;
            } else if (newVal === true) {
                // checkbox → text: render current items into draft
                this.draftText = renderText(this.items);
                this.priceViewMode = false;
            }
            this.save();
        },
        shoppingMode() {
            this.save();
        },
        selectedStore() {
            this.save();
        },
        items: {
            deep: true,
            handler() {
                this.save();
            },
        },
    },

    methods: {
        /* ── Display helpers ── */
        entryNormalized(entry) {
            return normalizePrice(entry.price, entry.amount, entry.amountUnit);
        },
        itemQty(text) {
            const p = parseItemText(text);
            if (p.quantity === null) return '';
            return p.quantity + (p.unit || '');
        },
        itemName(text) {
            return parseItemText(text).name;
        },
        itemPriceDisplay(text) {
            if (!this.shoppingMode) return '';
            const name = parseItemText(text).name;
            const entries = this.priceData[name.toLowerCase()];
            if (!entries || entries.length === 0) return '';

            // Find most recent entry for current store
            const currentEntry = entries.find(e => e.store === this.selectedStore);

            // Find most recent entries for OTHER stores
            const otherStores = {};
            for (const entry of entries) {
                if (entry.store !== this.selectedStore && !otherStores[entry.store]) {
                    otherStores[entry.store] = entry;
                }
            }

            // Extract normalized prices from other stores
            const otherPrices = Object.values(otherStores).map(entry => {
                const normalized = normalizePrice(entry.price, entry.amount, entry.amountUnit);
                if (!normalized) return null;
                const match = normalized.match(/([\d.]+)/);
                return match ? parseFloat(match[1]).toFixed(1) : null;
            }).filter(p => p !== null);

            // Determine unit for display
            let normalizedUnit = '';
            const refEntry = currentEntry || Object.values(otherStores)[0];
            if (refEntry) {
                const unit = refEntry.amountUnit;
                if (unit === 'g' || unit === 'kg') normalizedUnit = '\u20ac/kg';
                else if (unit === 'ml' || unit === 'l') normalizedUnit = '\u20ac/l';
            }

            // Format output
            if (currentEntry) {
                const rawPrice = `${currentEntry.price}\u20ac/${currentEntry.amount}${currentEntry.amountUnit || ''}`;
                if (otherPrices.length > 0) {
                    return `${rawPrice} (${otherPrices.join(', ')}) ${normalizedUnit}`;
                }
                return rawPrice;
            } else if (otherPrices.length > 0) {
                return `(${otherPrices.join(', ')}) ${normalizedUnit}`;
            }

            return '';
        },

        /* ── Modes ── */
        togglePriceView() {
            if (!this.priceViewMode) {
                // Turning price view ON
                if (this.textMode) {
                    // Commit any pending text-mode edits first
                    const { items, nextId } = parseTextLines(this.draftText, this.items, this._nextId);
                    this.items = items;
                    this._nextId = nextId;
                    this.textMode = false;
                }
                this.priceViewEditText = renderPriceViewText(this.priceData);
                this.priceViewMode = true;
            } else {
                // Turning price view OFF — parse textarea content back into priceData
                this.priceData = parsePriceViewText(this.priceViewEditText);
                this.priceViewMode = false;
                this.save();
            }
        },

        /* ── Check toggling ── */
        toggleCheck(item) {
            const idx = this.items.findIndex(i => i.id === item.id);
            if (idx === -1) return;

            this.pushUndo();
            this.items[idx].checked = !this.items[idx].checked;
            const nowChecked = this.items[idx].checked;

            if (this.shoppingMode && nowChecked) {
                // Move item to just before the first remaining unchecked item
                const insertIdx = this.items.findIndex(i => !i.checked);
                if (insertIdx !== -1 && insertIdx !== idx) {
                    const [moved] = this.items.splice(idx, 1);
                    this.items.splice(insertIdx, 0, moved);
                }
            }
            this.save();
        },

        /* ── Inline editing ── */
        startEdit(item) {
            this.editingItemId = item.id;
            this.editDraft = item.text;
            this._editOriginal = item.text;
            nextTick(() => {
                const el = document.getElementById('edit-' + item.id);
                if (el) el.focus();
            });
        },
        commitEdit(item) {
            // Guard: blur fires again when the input is removed from DOM after
            // keyup.enter or keyup.escape already committed/cancelled — ignore it.
            if (this.editingItemId !== item.id) return;
            const trimmed = this.editDraft.trim();
            if (!trimmed && !this._editOriginal) {
                // New blank item — delete it
                this.items.splice(this.items.findIndex(i => i.id === item.id), 1);
                this.selectedItemId = null;
            } else {
                this.pushUndo();
                item.text = trimmed || this._editOriginal;
            }
            this.editingItemId = null;
            this.editDraft = '';
            this._editOriginal = '';
            this.save();
        },
        cancelEdit(item) {
            if (!this._editOriginal) {
                // New blank item — delete it
                this.items.splice(this.items.findIndex(i => i.id === item.id), 1);
                this.selectedItemId = null;
                this.save();
            } else {
                item.text = this._editOriginal;
            }
            this.editingItemId = null;
            this.editDraft = '';
            this._editOriginal = '';
        },

        /* ── Adjust quantity ── */
        adjustQty(item, delta) {
            this.pushUndo();
            const p = parseItemText(item.text);
            // Step depends on unit: 100 for g/ml, 1 for kg/l/plain
            const step = (p.unit === 'g' || p.unit === 'ml') ? 100 : 1;
            const newQty = Math.round(((p.quantity ?? 0) + delta * step) * 1000) / 1000;
            if (newQty <= 0) {
                item.text = p.name;
            } else {
                item.text = `${newQty}${p.unit ?? ''} ${p.name}`;
            }
            this.save();
        },

        /* ── Item selection ── */
        selectItem(item) {
            this.selectedItemId = (this.selectedItemId === item.id) ? null : item.id;
        },

        /* ── Long-press (hold to edit) ── */
        onItemPointerDown(item, event) {
            this._pressStart = { id: item.id, moved: false };
            this._pressTimer = setTimeout(() => {
                this._pressTimer = null;
                this.startEdit(item);
            }, 500);
        },
        onItemPointerUp(item) {
            if (this._pressTimer !== null && this._pressStart && !this._pressStart.moved) {
                clearTimeout(this._pressTimer);
                this._pressTimer = null;
                this.selectItem(item);
            } else {
                clearTimeout(this._pressTimer);
                this._pressTimer = null;
            }
            this._pressStart = null;
        },
        onItemPointerMove() {
            if (this._pressStart) this._pressStart.moved = true;
            if (this._pressTimer !== null) {
                clearTimeout(this._pressTimer);
                this._pressTimer = null;
            }
        },
        onItemPointerCancel() {
            if (this._pressTimer !== null) {
                clearTimeout(this._pressTimer);
                this._pressTimer = null;
            }
            this._pressStart = null;
        },

        /* ── Undo ── */
        pushUndo() {
            this.undoStack.push(JSON.parse(JSON.stringify(this.items)));
            if (this.undoStack.length > 10) this.undoStack.shift();
        },
        undo() {
            if (this.undoStack.length === 0) return;
            this.items = this.undoStack.pop();
            this.selectedItemId = null;
            this.save();
        },

        /* ── Move up / down (within same checked/unchecked subgroup) ── */
        moveUp(item) {
            const groupIndices = this.items
                .map((it, i) => ({ it, i }))
                .filter(({ it }) => it.checked === item.checked)
                .map(({ i }) => i);
            const posInGroup = groupIndices.findIndex(i => this.items[i].id === item.id);
            if (posInGroup <= 0) return;
            this.pushUndo();
            const a = groupIndices[posInGroup - 1];
            const b = groupIndices[posInGroup];
            [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
            this.save();
        },
        moveDown(item) {
            const groupIndices = this.items
                .map((it, i) => ({ it, i }))
                .filter(({ it }) => it.checked === item.checked)
                .map(({ i }) => i);
            const posInGroup = groupIndices.findIndex(i => this.items[i].id === item.id);
            if (posInGroup === -1 || posInGroup >= groupIndices.length - 1) return;
            this.pushUndo();
            const a = groupIndices[posInGroup];
            const b = groupIndices[posInGroup + 1];
            [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
            this.save();
        },

        /* ── Delete / add selected item ── */
        deleteSelectedItem() {
            if (!this.selectedItem) return;
            this.pushUndo();
            this.items.splice(this.items.findIndex(i => i.id === this.selectedItemId), 1);
            this.selectedItemId = null;
            this.save();
        },
        addItemAfterSelected() {
            this.pushUndo();
            const newItem = { id: this._nextId++, text: '', checked: false };
            const idx = this.selectedItem
                ? this.items.findIndex(i => i.id === this.selectedItemId)
                : this.items.length - 1;
            this.items.splice(idx + 1, 0, newItem);
            this.filterText = '';
            this.selectedItemId = newItem.id;
            nextTick(() => this.startEdit(newItem));
        },

        /* ── Burger menu commands ── */
        uncheckAll() {
            this.menuOpen = false;
            this.pushUndo();
            this.items.forEach(item => { item.checked = false; });
            this.save();
        },
        copyAllData() {
            this.menuOpen = false;
            const text = this.items.map(item => (item.checked ? '[x] ' : '[ ] ') + item.text).join('\n');
            navigator.clipboard.writeText(text).catch(() => { });
        },

        /* ── Price modal ── */
        openPriceModal(item) {
            this.priceModalItem = parseItemText(item.text).name;
            this.priceForm.date = today();
            this.priceForm.store = this.selectedStore;
            this.priceForm.raw = '';
            this.priceForm.info = '';
        },
        closePriceModal() {
            this.priceModalItem = null;
        },
        addPriceEntry() {
            const p = parsePriceRaw(this.priceForm.raw);
            if (!p) return;
            const name = this.priceModalItem.toLowerCase();
            if (!this.priceData[name]) this.priceData[name] = [];
            this.priceData[name].push({
                date: this.priceForm.date || today(),
                store: this.priceForm.store || '',
                price: p.price,
                priceUnit: '€',
                amount: p.amount,
                amountUnit: p.unit,
                info: this.priceForm.info.trim(),
            });
            // Sort descending by date
            this.priceData[name].sort((a, b) => b.date.localeCompare(a.date));
            this.priceForm.raw = '';
            this.priceForm.info = '';
            this.save();
        },
        deletePriceEntry(idx) {
            const name = this.priceModalItem.toLowerCase();
            if (this.priceData[name]) {
                this.priceData[name].splice(idx, 1);
                this.save();
            }
        },

        /* ── Numpad ── */
        numpadInput(char) {
            this.priceForm.raw += char;
        },
        numpadDel() {
            this.priceForm.raw = this.priceForm.raw.slice(0, -1);
        },
        numpadUnit(unit) {
            // Remove any trailing unit suffix before appending
            this.priceForm.raw = this.priceForm.raw.replace(/(g|kg|ml|l)$/i, '');
            this.priceForm.raw += unit;
        },

        /* ── Persistence ── */
        save() {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                // Strip transient 'editing' flag — only persist { id, text, checked }
                items: this.items.map(({ id, text, checked }) => ({ id, text, checked })),
                textMode: this.textMode,
                shoppingMode: this.shoppingMode,
                selectedStore: this.selectedStore,
                nextId: this._nextId,
                draftText: this.textMode ? this.draftText : renderText(this.items),
                priceData: this.priceData,
            }));
        },

        load() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) return;
                const data = JSON.parse(raw);

                // Restore nextId first so dedup can mint fresh IDs
                this._nextId = data.nextId ?? 1;

                // Load items, stripping any unexpected fields
                this.items = (data.items ?? []).map(item => ({
                    id: item.id,
                    text: item.text,
                    checked: item.checked ?? false,
                }));

                // Load-time dedup: reassign any duplicate IDs
                const seenIds = new Set();
                for (const item of this.items) {
                    if (seenIds.has(item.id)) {
                        item.id = this._nextId++;
                    } else {
                        seenIds.add(item.id);
                        if (item.id >= this._nextId) this._nextId = item.id + 1;
                    }
                }

                this.textMode = data.textMode ?? false;
                this.shoppingMode = data.shoppingMode ?? false;
                this.selectedStore = data.selectedStore ?? 'lidl';
                this.priceData = data.priceData ?? {};
                this.draftText = this.textMode
                    ? (data.draftText ?? renderText(this.items))
                    : renderText(this.items);
            } catch (e) {
                console.warn('Failed to load from localStorage', e);
            }
        },
    },

    created() {
        this.load();
        document.addEventListener('click', () => { this.menuOpen = false; });
    },
}).mount('#app');
