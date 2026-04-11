# Shopping List App — Specification

## Overview

A single-page checklist app (similar to Google Keep) served via GitHub Pages. No build step — pure HTML, CSS, and Vue 3 (Options API) loaded from CDN. All state is persisted to `localStorage`.

---

## Tech Stack

| Concern     | Choice                                                                   |
| ----------- | ------------------------------------------------------------------------ |
| Framework   | Vue 3 Options API via CDN `<script type="module">` tag                   |
| CSS         | Pico CSS via CDN (classless baseline); custom CSS in `style.css`         |
| Icons       | Font Awesome 6 Free via CDN                                              |
| Persistence | `localStorage`                                                           |
| Deployment  | GitHub Pages (static, `index.html` + `style.css` + `core.js` + `app.js`) |
| Build       | None                                                                     |
| Testing     | Node built-in `node:test` + `node:assert`; run with `node --test`        |

---

## Data Model

### Items

A single flat array is the source of truth:

```js
items: [
  { id: number, text: string, checked: boolean },
  ...
]
```

The two visual lists (unchecked / checked) are **derived** from this array via computed properties — nothing is stored in two places.

#### Item text format (units & quantities)

An item's text **optionally** starts with a quantity and unit:

```
<number><unit> <name>
```

Supported units: `g`, `kg`, `ml`, `l`. A plain number (no unit suffix) is also accepted. No quantity is also valid.

| Text input   | Quantity | Unit     | Name     |
| ------------ | -------- | -------- | -------- |
| `2kg apples` | 2        | `kg`     | `apples` |
| `500g flour` | 500      | `g`      | `flour`  |
| `3 eggs`     | 3        | *(none)* | `eggs`   |
| `milk`       | *(none)* | *(none)* | `milk`   |

Quantity and unit are **parsed at render time** from `text` using a helper function `parseItemText(text)` — they are not stored as separate fields. This keeps text-mode round-tripping trivial.

```js
// Returns { quantity: number|null, unit: string|null, name: string }
// Regex: /^(\d+(?:\.\d+)?)(g|kg|ml|l)?\s+(.+)$/i
```

### Price Data

Historical price entries, stored alongside items in `localStorage`:

```js
priceData: {
  "<item-name-lowercase>": [
    { date: "2026-03-27", store: "spar", price: 10, priceUnit: "€", amount: 1, amountUnit: "kg", info: "good brand" },
    ...
  ]
}
```

- Linked to checklist items by **item name** (lowercase-normalized).
- Each entry records: date, store, price (number + `€`), amount (number + unit), and a free-text info note.
- `store` and `info` default to `""` — old entries without these fields load without error.
- Entries are sorted by date descending.
- Up to the last 10 entries are displayed in the modal.

### ID Generation

- `_nextId` is an auto-incrementing integer counter, persisted as `nextId` in `localStorage`.
- New IDs are minted in `parseText()` via `this._nextId++`.
- **Reuse with dedup guard:** When switching from text → checklist, the parser builds a queue of existing IDs keyed by item text. It pops IDs from the queue for matching text, minting a new ID only when the queue is empty. A `Set` of already-assigned IDs prevents any ID from being used twice — if a popped ID is already in the set, a fresh one is minted instead.
- **Load-time dedup:** On `load()`, any items with duplicate IDs are reassigned fresh IDs using `_nextId++`. This self-heals corrupt `localStorage` data.

### Persisted `localStorage` key: `sldata`

```json
{
  "items": [...],
  "textMode": false,
  "shoppingMode": false,
  "selectedStore": "lidl",
  "nextId": 42,
  "draftText": "...",
  "priceData": { ... }
}
```

> Note: The transient `editing` flag on items is **stripped** before serialization.
> `selectedStore` persists the last-used store across sessions.

---

## Modes

### Text mode (`textMode: boolean`)

- **ON** — the entire list is shown as a single `<textarea>`.
- **OFF** — the list is shown as interactive checkboxes split into two sections.

Switching **text → checkbox**: the textarea content is parsed back into `items`.
Switching **checkbox → text**: the textarea is rendered from current `items` state.

#### Text format

Each item occupies one line using the following syntax:

```
- [ ] unchecked item text
- [x] checked item text
```

Lines that do **not** match either prefix are imported as **unchecked** items (the raw line text becomes the item text).

### Shopping mode (`shoppingMode: boolean`)

Controls whether checking an item changes its position in the underlying `items` array.

| Mode             | Check action                                                                                                                                                          | Uncheck action                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Not-shopping** | `checked` flipped to `true`, position unchanged                                                                                                                       | `checked` flipped to `false`, position unchanged |
| **Shopping**     | `checked` flipped to `true`, item moved to the position of the **first unchecked item** from the top (i.e. accumulated at the boundary between checked and unchecked) | `checked` flipped to `false`, position unchanged |

Unchecking **never** moves an item regardless of mode.

### Price view mode (`priceViewMode: boolean`)

- **ON** — the main area shows an **editable `<textarea>`** pre-populated with all price data in the canonical text format (see [Price Data Text View](#price-data-text-view)). The user may freely edit, copy, or paste entries.
- **OFF** — if the textarea was modified, its content is parsed back into `priceData` and saved before switching back to normal view.
- Mutually exclusive with `textMode` — activating one deactivates the other.
- Toggled via a nav bar button (Font Awesome icon).
- Not persisted.

### Filter (`filterText: string`)

- Visible in **checkbox mode only** — displayed as a text `<input>` inside the sticky `<nav>`.
- Case-insensitive substring match against `item.text`.
- Both the unchecked and checked computed lists are further filtered by `filterText` before rendering.
- `filterText` is **not** persisted (resets to empty string on page load).
- Hidden when in text mode or price view mode.

---

## UI Layout

```
┌────────────────────────────────────────────┐
│  <nav> (sticky top)                        │
│  [🛒] [T] [$]  [Store ▼]  [☰]            │  ← icon mode buttons (blue=on) + burger menu
│  [ 🔍 filter...                        ]   │  ← checkbox mode only
├────────────────────────────────────────────┤
│                                            │
│  (text mode)                               │
│  ┌──────────────────────────────────────┐  │
│  │ - [ ] 2kg apples                     │  │
│  │ - [x] 500ml milk                     │  │  ← single <textarea>
│  │ - [ ] 3 eggs                         │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  (checkbox mode)                           │
│  :: ☐ 2kg  apples    2.5€/450g (7.8) €/kg │  ← :: = selected indicator
│     ☐      bread                           │
│  ─────────────────────────────────────     │
│     ☑ 500ml milk                           │  ← strikethrough, muted
│                                            │
│  (price view mode — editable textarea)     │
│  - apples                                  │
│    - 2026-03-28 spar 10€/1kg good brand    │
│  - milk                                    │
│    - 2026-03-27 lidl 1.5€/1l               │
│                                            │
├────────────────────────────────────────────┤
│  [+] [-] [↑] [↓] [🖩] [↩]     [⊕]  [🗑] │  ← fixed bottom toolbar
└────────────────────────────────────────────┘
```

### Nav Bar (`<nav>`)

- Uses Pico CSS `<nav>` element for structure.
- **Sticky**: `position: sticky; top: 0; z-index: 10;` with a solid background so content scrolls behind it.
- Contains:
  1. Four compact **mode/action buttons** in order: **cart** (`fa-cart-shopping` icon) → **T** → **$** → **Store dropdown** → **burger** (`fa-bars` icon).
     - **cart** (`fa-cart-shopping` icon) — toggles `shoppingMode`. Color: default (off) / `var(--pico-primary)` blue (on).
     - **T** (text label) — toggles `textMode`. Same color rule.
     - **$** (dollar sign label) — toggles `priceViewMode`. Same color rule.
  2. A **Store** dropdown (`<select>`) — always visible, hardcoded options: `lidl`, `spar`, `other`. Bound to `selectedStore`, persisted in `localStorage`. Pre-fills the store field when opening the price modal.
  3. A **Burger menu** button (`fa-bars` icon) — toggles a dropdown panel containing:
     - **Uncheck all** (`fa-regular fa-square` icon) — calls `uncheckAll()`.
     - **Copy all data** (`fa-regular fa-copy` icon) — calls `copyAllData()`.
     The dropdown closes when the user taps outside it (via a document-level click listener).
  4. The filter input (checkbox mode only, hidden when `textMode` or `priceViewMode` is on).

### Checkbox Mode

Two `<ul>` lists rendered from computed properties:

1. **Unchecked list** — `items.filter(i => !i.checked)` further filtered by `filterText`, preserving array order.
2. **Checked list** — `items.filter(i => i.checked)` further filtered by `filterText`, preserving array order. Items are shown with strikethrough and muted styling.

A divider between the two lists is hidden when either filtered list is empty.

#### Item Selection

- **Tap** an item's text area → selects that item (sets `selectedItemId`). Tapping the already-selected item deselects it.
- Selected item is indicated by a `::` prefix span before the checkbox. No background color change.
- Only one item can be selected at a time.
- `selectedItemId` is transient — not persisted.

#### Inline Editing

- **Hold** (long-press ≥ 500 ms) on an item's text → enters inline edit mode (`<input type="text">`, auto-focused).
- Pointer movement during hold cancels the long-press timer.
- **Blur** (tap away) or **Enter**: commits the edit and saves.
- **Escape**: cancels the edit, reverts to original text.
- If a new blank item was created (via bottom toolbar ⊕) and the user cancels or commits with empty text, the item is deleted.

#### Per-Item Toolbar (right side)

Each `<li>` shows only the price comparison display (no action buttons):

- Price comparison text is shown in muted small text when in shopping mode.

No move-up/down/calculator/+/- buttons on individual items — all actions are in the bottom toolbar.

#### Bottom Toolbar

A `<nav class="bottom-toolbar">` fixed to the bottom of the viewport, visible in checkbox mode only (hidden in text mode and price view mode).

**Left group (float left):**

| Button | Icon                   | Disabled when                        | Action                                   |
| ------ | ---------------------- | ------------------------------------ | ---------------------------------------- |
| +      | `fa-plus`              | no item selected                     | Increase quantity of selected item       |
| −      | `fa-minus`             | no item selected                     | Decrease quantity of selected item       |
| ↑      | `fa-caret-up`          | no item selected                     | Move selected item up in `items` array   |
| ↓      | `fa-caret-down`        | no item selected                     | Move selected item down in `items` array |
| 🖩      | `fa-calculator`        | no item selected OR not shoppingMode | Open price modal for selected item       |
| ↩      | `fa-arrow-rotate-left` | undo stack empty                     | Undo last items-array mutation           |

**Right group (float right):**

| Button | Icon             | Disabled when    | Action                                            |
| ------ | ---------------- | ---------------- | ------------------------------------------------- |
| ⊕      | `fa-circle-plus` | no item selected | Insert blank item after selected, enter edit mode |
| 🗑      | `fa-trash`       | no item selected | Delete selected item                              |

#### Quantity/Unit Display

When an item's text starts with a quantity (and optional unit), it is displayed as a styled badge/prefix (e.g. `<span class="item-qty">2kg</span>`) before the item name in checklist view.

#### Quantity/Unit Display

When an item's text starts with a quantity (and optional unit), it is displayed as a styled badge/prefix (e.g. `<span class="item-qty">2kg</span>`) before the item name in checklist view.

#### Price Comparison Display

When in **shopping mode**, each item shows normalized prices from other stores for comparison.

**Format examples:**
- Current store has price, one other store: `2.5€/450g (6.4) €/kg`
- Current store has price, multiple other stores: `2.5€/450g (6.4, 7.8) €/kg`
- Current store has no price: `(6.4, 7.8) €/kg`

**Example:**
```
Price data:
- avocado
  - 2026-03-28 lidl 2.99€/450g  (≈ 6.6€/kg)
  - 2026-03-28 spar 3.5€/450g   (≈ 7.8€/kg)

When shopping at lidl:
  - [ ] avocado    2.99€/450g (7.8) €/kg
       ↑ Shows raw price from lidl and normalized price from spar

When shopping at other (no price):
  - [ ] avocado    (6.6, 7.8) €/kg
       ↑ Shows normalized prices from lidl and spar for comparison
```

**Display rules:**
- Only shown when in shopping mode
- Shows most recent normalized prices from other stores in parentheses
- If current store has a price, shows raw price followed by other stores' normalized prices
- If current store has no price, shows only other stores' normalized prices in parentheses
- If no price data exists for any store, shows nothing
- Price comparison is shown in muted text, sized at 0.75rem, positioned in the item toolbar (before the +/- buttons)

**Implementation:**
- UI method `itemPriceDisplay(text)` handles all formatting logic
- Finds most recent entry for current store and each other store
- Normalizes prices to €/kg or €/l using `normalizePrice()` from `core.js`
- Displays actual normalized prices, not differences

### Text Mode

A single `<textarea>` occupying the full remaining viewport height (`min-height: calc(100vh - <nav height>)`; no fixed max-height). On mobile the textarea fills the screen below the nav for easy editing.

- **Getter** — renders `items` as `- [x]`/`- [ ]` lines.
- **Setter** — parses lines back into `items`. Called when switching back to checkbox mode (not on every keystroke).

### Price Data Text View

Activated via the **Prices** nav button. Shows an **editable `<textarea>`** (same full-height styling as text mode) pre-populated with all price data in the following format:

```
- apples
  - 2026-03-28 spar 10€/1kg good brand with discount
  - 2026-03-20 lidl 8€/1kg
- milk
  - 2026-03-27 spar 1.5€/1l fresh
```

**Format rules:**

- Each item name is on its own line: `- <name>`
- Each price entry is indented: `  - <date> <store> <price>€/<amount><unit> <info>`
- `<info>` is optional — everything after `<amount><unit>` on the same line is treated as the info note.
- `<store>` is a single word (no spaces).
- Items sorted alphabetically by name; entries within each item sorted by date descending.
- Only items with at least one price entry are shown.

**Parsing (on toggle-off):**

Entry lines are matched by:
```
/^\s*-\s+(\d{4}-\d{2}-\d{2})\s+(\S+)\s+(\d+(?:\.\d+)?)€\/(\d+(?:\.\d+)?)(g|kg|ml|l)?\s*(.*)$/i
```
Groups: `date`, `store`, `price`, `amount`, `amountUnit`, `info`.

Item name lines matched by: `/^-\s+(.+)$/`

Any line not matching either pattern is silently skipped. The resulting object fully **replaces** `priceData` and is saved.

---

## Price Calculator Modal

A native `<dialog>` element (Pico CSS supports `<dialog>` styling) opened from the bottom toolbar's calculator button (shopping mode only).

### Layout

```
┌──────────────────────────────────────────────┐
│  Price: apples                               │
├──────────────────────────────────────────────┤
│                                              │
│  [2026-03-28] [spar ▼]                       │
│  [5/1kg          ] = 5€/kg    [note...] [+]  │  ← add entry form
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  7  │  8  │  9  │  /  │              │  │  ← numpad
│  │  4  │  5  │  6  │  g  │              │  │
│  │  1  │  2  │  3  │ kg  │              │  │
│  │  0  │  .  │ DEL │  l  │              │  │
│  │ CLR │ ml  │    ENTER   │              │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  2026-03-28 spar 10€/1kg good brand    [🗑]  │  ← existing entries
│  2026-03-20 lidl  8€/1kg               [🗑]  │
│  ...                                         │
│                                              │
│                               [Close]        │
└──────────────────────────────────────────────┘
```

### Behaviour

- **Header** shows the item name.
- **Add form** — inputs:
  - Date (`<input type="date">`, defaults to today — wider than before to show full date).
  - Store (`<select>`: `lidl`, `spar`, `other`) — pre-filled from `selectedStore` in the nav, but editable per-entry.
  - Raw price/amount (`<input type="text">`, e.g. `5/1kg` or `2.5/500g` or `4/2` for unit-less), with a live normalized preview.
  - Info (`<input type="text">`, free-text note, optional).
  - Add button (`fa-plus` icon) appends entry and saves.
- **Numpad** — targets the raw price/amount field. Buttons:
  - Digits `0`–`9`: append digit to `priceForm.raw`.
  - `/`, `.`: append character.
  - `g`, `kg`, `l`, `ml`: append unit string (replacing any trailing existing unit to avoid duplicates).
  - `DEL`: remove last character from `priceForm.raw`.
  - `CLR`: clear `priceForm.raw`.
  - `ENTER`: calls `addPriceEntry()`.
  - Layout: 4-column grid, 5 rows — `7 8 9 /` | `4 5 6 g` | `1 2 3 kg` | `0 . DEL l` | `CLR ml ENTER(colspan-2)`.
- **Entry list** — shows up to the last 10 entries sorted by date descending. Each row displays date, store, price€/amountUnit, info, and a delete button (`fa-trash`).
- **Persistence** — entries are stored in `priceData` (inside `sldata` localStorage key), keyed by item name (lowercase).
- **Close** button (or clicking backdrop) closes the modal.

### Data Properties for Modal State

```js
priceModalItem: null,   // item name string when modal is open, null when closed
priceForm: {
  date: "",       // defaults to today()
  store: "",      // pre-filled from selectedStore
  raw: "",        // e.g. "5/1kg"
  info: "",       // free-text note
}
```

---

## Styling Approach

1. **Pico CSS** from CDN is the baseline — provides sensible typography, form element styling, toggle switches (`role="switch"`), dialog, nav, etc.
2. **Font Awesome 6 Free** from CDN for all icons.
3. **Custom CSS lives in `docs/style.css`** (linked from `index.html`). Only added when Pico doesn't cover the need:
   - Sticky nav (`position: sticky`)
   - Full-viewport textarea height (text mode and price view mode)
   - Strikethrough / muted color for checked items
   - Divider between unchecked/checked lists
   - Item toolbar layout (`.item-toolbar`)
   - Quantity badge (`.item-qty`)
   - Price modal / entry row styling
   - Price text view styling
   - Inline edit input (borderless, matches label styling until focused)
   - Wider date input in price modal (`min-width` so full YYYY-MM-DD is visible)
   - Minor layout tweaks (gap, padding)

---

## Computed Properties

| Name                     | Description                                                                    |
| ------------------------ | ------------------------------------------------------------------------------ |
| `uncheckedItems`         | `items.filter(i => !i.checked)` — preserves array order                        |
| `checkedItems`           | `items.filter(i => i.checked)` — preserves array order                         |
| `filteredUncheckedItems` | `uncheckedItems` further filtered by `filterText` (case-insensitive substring) |
| `filteredCheckedItems`   | `checkedItems` further filtered by `filterText` (case-insensitive substring)   |
| `currentPriceEntries`    | `priceData[priceModalItem]` sliced to the last 10 entries, or `[]`             |
| `priceFormNormalized`    | Live normalized price string (e.g. `= 5€/kg`) derived from `priceForm.raw`     |
| `selectedItem`           | The item object whose `id === selectedItemId`, or `null`                       |

---

## Pure Functions (in `core.js`)

All functions are exported ES module members, usable in both the browser and Node tests.

### `parseItemText(text)`

Parses item text into structured parts.

```js
// Input:  "2kg apples"
// Output: { quantity: 2, unit: "kg", name: "apples" }
// Input:  "milk"
// Output: { quantity: null, unit: null, name: "milk" }
// Regex: /^(\d+(?:\.\d+)?)(g|kg|ml|l)?\s+(.+)$/i
```

### `parsePriceRaw(raw)`

Parses the freeform price/amount input string.

```js
// Input:  "5/1kg"    → { price: 5,   amount: 1,   amountUnit: "kg" }
// Input:  "2.5/500g" → { price: 2.5, amount: 500, amountUnit: "g"  }
// Invalid → null
```

### `normalizePrice(price, amount, amountUnit)`

Returns a normalized per-kg, per-l, or per-unit price string for display.

- `unit = "g"` → `price / amount * 1000` → `"X€/kg"`
- `unit = "kg"` → `price / amount` → `"X€/kg"`
- `unit = "ml"` → `price / amount * 1000` → `"X€/l"`
- `unit = "l"` → `price / amount` → `"X€/l"`
- `unit = null` (no unit) → `price / amount` → `"X€/pc"` (per piece / per unit)
- Any other invalid input → `null`

### `today()`

Returns today's date as `"YYYY-MM-DD"`.

### `renderPriceViewText(priceData)`

Pure function. Takes a `priceData` object, returns the canonical multiline text string (sorted alphabetically, entries by date descending, format: `  - date store price€/amountUnit info`). Used to populate the price view textarea.

### `parsePriceViewText(text)`

Pure function. Parses the editable price view textarea back into a `priceData` object. Returns `{}` if the string is empty or has no valid entries. Silently skips unrecognized lines.

### `getItemPriceInfo(itemName, priceData, currentStore)`

Pure function. Returns price comparison data for an item across stores.

```js
// Input:  itemName = "apples", priceData with entries for lidl (8€/kg) and spar (10€/kg), currentStore = "lidl"
// Output: { currentPrice: 8, minDiff: 0, maxDiff: 2 }
//         (lidl is cheapest, spar is 2€ more expensive)
// 
// Output: null if item has no price data or current store has no price
```

**Behavior:**
- Finds most recent entry for each store (by date)
- Normalizes all prices to €/kg or €/l
- Returns `currentPrice` (numeric only), `minDiff` (negative if current is more expensive), `maxDiff` (positive if current is cheaper)
- Item name matching is case-insensitive

### `renderText(items)`

Pure function. Takes an `items` array, returns the checklist textarea string (`- [x]` / `- [ ]` lines).

### `parseTextLines(raw, existingItems, nextIdStart)`

Pure function. Parses raw checklist text back into items, reusing existing IDs where possible.

```js
// Returns: { items: Array<{id, text, checked}>, nextId: number }
```

---

## Vue Methods

### `selectItem(item)`

Toggles `selectedItemId`: if the item is already selected, sets `selectedItemId = null`; otherwise sets it to `item.id`.

### `onItemPointerDown(item, event)`

Records press start (`_pressStart = { id: item.id, moved: false }`). Starts a 500 ms timer; on expiry calls `startEdit(item)` and clears `_pressTimer`.

### `onItemPointerUp(item)`

If the timer is still pending (i.e., hold threshold not reached) and `_pressStart.moved` is false, calls `selectItem(item)`. Cancels the timer.

### `onItemPointerMove()`

Sets `_pressStart.moved = true` and cancels the long-press timer (prevents accidental edit on scroll).

### `onItemPointerCancel()`

Cancels the long-press timer.

### `pushUndo()`

Deep-clones `this.items` and pushes the snapshot onto `this.undoStack`. If the stack exceeds 10 entries, shifts the oldest off.

### `undo()`

Pops the most recent snapshot from `undoStack`, restores it to `this.items`, clears `selectedItemId`, and calls `save()`. No-op if the stack is empty.

### `toggleCheck(item)`

1. Calls `pushUndo()`.
2. Flip `item.checked`.
3. If `shoppingMode` is **on** and the item just became **checked**:
   - Find `insertIndex` = index of the first unchecked item in `items` (after the flip).
   - Splice the item out of its current position.
   - Insert it at `insertIndex` (it now sits at the bottom of the checked block / top of unchecked block).
4. Call `save()`.

### `startEdit(item)`

Sets `editingItemId = item.id`, `editDraft = item.text`, `_editOriginal = item.text`. On `nextTick`, focuses the inline input.

### `commitEdit(item)`

- Guard: if `editingItemId !== item.id`, return (prevents double-fire from blur+enter).
- `trimmed = editDraft.trim()`
- If `trimmed` is empty AND `_editOriginal` is empty → delete the item from `items`, clear `selectedItemId`.
- Else: `item.text = trimmed || _editOriginal`.
- Reset `editingItemId`, `editDraft`, `_editOriginal`. Call `save()`.

### `cancelEdit(item)`

- If `_editOriginal` is empty (item was newly created) → delete item, clear `selectedItemId`.
- Else: revert `item.text = _editOriginal`.
- Reset `editingItemId`, `editDraft`, `_editOriginal`.

### `moveUp(item)` / `moveDown(item)`

Calls `pushUndo()`. Finds the item's position within the **same `checked` subgroup** (unchecked items can only move among unchecked; checked items among checked). Swaps the item with the adjacent one in that subgroup (using the flat `items` array indices of those group members). Calls `save()`. No-op if the item is already at the boundary of its subgroup.

**Implementation note:** Build `groupIndices` by filtering `this.items` to those with the same `checked` state and extracting their flat indices. Find `posInGroup`, then swap `items[groupIndices[posInGroup ± 1]]`.

### `adjustQty(item, delta)`

Calls `pushUndo()`. Reads `parseItemText(item.text)`, computes new quantity (step = 100 for g/ml, 1 for kg/l/plain), updates `item.text`. Removes quantity prefix if new qty ≤ 0. Calls `save()`.

### `deleteSelectedItem()`

Calls `pushUndo()`. Splices `selectedItem` from `items`. Sets `selectedItemId = null`. Calls `save()`.

### `addItemAfterSelected()`

Calls `pushUndo()`. Inserts a new blank item `{ id: nextId++, text: '', checked: false }` immediately after `selectedItem` in `items` (or at the end if none selected). Clears `filterText`. Sets `selectedItemId` to the new item's id. On `nextTick`, calls `startEdit(newItem)`.

### `uncheckAll()`

Closes the burger menu (`menuOpen = false`). Calls `pushUndo()`. Sets `checked = false` on every item. Calls `save()`.

### `copyAllData()`

Closes the burger menu (`menuOpen = false`). Builds a plain-text string of all items: `[ ] text` (unchecked) or `[x] text` (checked), one per line. Writes it to the clipboard via `navigator.clipboard.writeText()`.

### `openPriceModal(item)`

Sets `priceModalItem` to the item name (parsed via `parseItemText`). Resets `priceForm` with `date = today()`, `store = selectedStore`, `raw = ""`, `info = ""`. Opens the `<dialog>`.

### `numpadInput(char)`

Appends `char` to `priceForm.raw`.

### `numpadDel()`

Removes the last character from `priceForm.raw`.

### `numpadUnit(unit)`

Replaces any trailing unit suffix in `priceForm.raw` with the new unit (avoids `1kgkg`), then appends the unit if not already present.

### `addPriceEntry()`

Reads `priceForm`. Pushes `{ date, store, price, priceUnit: "€", amount, amountUnit, info }` to `priceData[priceModalItem.toLowerCase()]`, sorts by date descending, resets `priceForm.raw` and `priceForm.info`, calls `save()`.

### `deletePriceEntry(itemName, index)`

Removes the entry at `index` from `priceData[itemName.toLowerCase()]`, calls `save()`.

### `togglePriceView()`

- If turning **on**: sets `priceViewMode = true`, sets `textMode = false`, populates `priceViewEditText = renderPriceViewText(priceData)`.
- If turning **off**: parses `priceViewEditText` via `parsePriceViewText`, overwrites `priceData`, calls `save()`, sets `priceViewMode = false`.

### `save()`

```js
localStorage.setItem('sldata', JSON.stringify({
  items: items.map(({ id, text, checked }) => ({ id, text, checked })),  // strip 'editing'
  textMode,
  shoppingMode,
  selectedStore,
  nextId: _nextId,
  draftText,
  priceData
}))
```

### `load()` (called in `created()`)

Reads `sldata` from `localStorage` and rehydrates `items`, `textMode`, `shoppingMode`, `selectedStore`, `_nextId`, `draftText`, `priceData`. Falls back to empty defaults if the key doesn't exist. Runs duplicate-ID dedup on loaded items.

---

## Undo

- **Stack**: `undoStack` — array of deep-cloned `items` snapshots; max depth 10 (oldest entry dropped when full).
- **What is saved**: `items` array only (order, text, checked state). `priceData`, mode flags, and `selectedItemId` are not part of undo.
- **Trigger**: `pushUndo()` is called before every mutation: `toggleCheck`, `adjustQty`, `moveUp`, `moveDown`, `deleteSelectedItem`, `addItemAfterSelected`, and `commitEdit` (when text changes).
- **Restore**: `undo()` pops the most recent snapshot, writes it to `items`, clears `selectedItemId`, calls `save()`.
- **Not persisted** — the undo stack is lost on page refresh.

---

## Watchers

| Watch target                          | Action                                          |
| ------------------------------------- | ----------------------------------------------- |
| `textMode` (old `true` → new `false`) | Parse `rawText` setter to sync textarea → items |
| `items` (deep)                        | Call `save()`                                   |
| `textMode`                            | Call `save()`                                   |
| `shoppingMode`                        | Call `save()`                                   |
| `selectedStore`                       | Call `save()`                                   |

---

## File Structure

```
docs/
  index.html        ← HTML shell + CDN links; no inline CSS or JS
  style.css         ← all custom CSS
  core.js           ← pure functions (ES module); shared by app.js and tests
  app.js            ← Vue app definition (imports core.js); mounted in index.html
  spec.md           ← this file
  issues.md         ← known issues / bug reports
  journal.md        ← development journal
tests/
  core.test.js      ← Node built-in test runner; imports ../docs/core.js
package.json        ← { "type": "module" } — enables ES module imports for Node
```

---

## Acceptance Criteria

### Core (existing)

1. Items added in text mode appear as checkboxes after switching to checkbox mode.
2. Checking/unchecking items in not-shopping mode never changes their order.
3. Checking item N in shopping mode moves it to just after all currently-checked items; unchecking it leaves it in its current position.
4. Switching to text mode shows correct `- [x]`/`- [ ]` prefixes.
5. Lines without a valid prefix are imported as unchecked.
6. Refreshing the page restores all items, check states, and both toggle states.
7. Both lists (or the textarea) are empty when no items exist.
8. The checked section (and its divider) is hidden when no items are checked.
9. The nav bar stays fixed at the top while the list scrolls.
10. The textarea fills the remaining viewport height on mobile — no fixed max-height.
11. Typing in the filter input narrows both the unchecked and checked lists by case-insensitive substring match.
12. Pico CSS handles base styling; custom CSS lives only in `style.css`.

### ID uniqueness

13. Switching between text and checklist modes never produces duplicate item IDs, even when multiple items share the same text.
14. Loading corrupt `localStorage` data with duplicate IDs self-heals by reassigning fresh IDs.

### Inline editing

15. Holding (long-pressing ≥ 500 ms) an item's text enters inline edit mode.
16. Pressing Enter or tapping away commits the edit.
17. Pressing Escape cancels the edit and reverts to the original text.
18. The transient `editing` flag is never persisted to `localStorage`.
19. Committing or cancelling an edit on a newly-created blank item (via ⊕) deletes the item.

### Item selection

20. Tapping an item in checkbox mode selects it — `::` indicator appears before its checkbox.
21. Tapping the selected item deselects it; tapping a different item moves the selection.
22. `selectedItemId` is not persisted.

### Bottom toolbar

23. The bottom toolbar is fixed to the viewport bottom, visible only in checkbox mode.
24. +/- buttons adjust the quantity of the selected item (or add/remove a plain number prefix).
25. ↑/↓ buttons move the selected item up or down in the `items` array.
26. Calculator button (🖩) is disabled unless an item is selected AND `shoppingMode` is on.
27. Undo button (↩) is disabled when the undo stack is empty.
28. ⊕ inserts a blank item after the selected one and immediately enters inline edit mode.
29. 🗑 deletes the selected item.
30. All left-group buttons except ↩ are disabled when no item is selected; 🗑 and ⊕ are also disabled when no item is selected.

### Undo

31. Every items-array mutation (check, adjust qty, move, delete, add, edit) pushes a snapshot onto the undo stack before mutating.
32. Undo restores the previous items state, clears `selectedItemId`, and saves.
33. The undo stack is capped at 10 entries.
34. The undo stack is not persisted — it resets on page refresh.

### Units

35. Item text starting with `<number><unit>` (e.g. `2kg`, `500g`, `3`) is parsed and displayed as a quantity badge in checklist view.
36. Supported units: `g`, `kg`, `ml`, `l`. Plain number (no unit) is also accepted.
37. Items with no quantity prefix display normally with no badge.
38. Unit parsing is display-only — the raw `text` field is preserved for text-mode round-tripping.

### Price calculator modal

39. The calculator button in the bottom toolbar opens a modal for the selected item (shopping mode only).
40. The modal shows up to the last 10 price entries sorted by date descending.
41. New entries can be added with date, store, price/amount (raw input), and info note.
42. Entries can be deleted individually.
43. Price data is persisted in `localStorage` under `priceData`, keyed by item name (lowercase).
44. The date input in the modal is wide enough to display the full YYYY-MM-DD value without truncation.
45. The numpad appends digits and units to the raw field; DEL removes last char; CLR clears; ENTER submits.
46. A price entry with no unit (e.g. `4/2`) normalizes to `2€/pc` in the preview.
47. Info text in price entries wraps to the next line at word boundaries (no mid-word breaks).

### Store selector

48. A store `<select>` (`lidl`, `spar`, `other`) is always visible in the nav bar.
49. The selected store is persisted to `localStorage` and restored on page load.
50. Opening the price modal pre-fills the store field from the nav selector, but allows per-entry override.
51. Each saved price entry records the store name alongside the other fields.

### Price data text view (editable)

52. The `$` nav button toggles an editable textarea view of all price data.
53. Items in the price view are sorted alphabetically; entries within each item by date descending.
54. Only items with at least one price entry appear in the view.
55. Each entry is rendered as: `  - date store price€/amountUnit info` (info is omitted if empty).
56. Toggling the Prices view off parses the textarea content and overwrites `priceData` with the result, then saves.
57. Entries with no info field round-trip correctly (render/parse with no info produces the same data).
58. Old `localStorage` entries without `store` or `info` fields load without error (default to `""`).

### Nav mode buttons

59. The nav bar buttons appear in order: cart (🛒), T, $, Store dropdown, burger (☰).
60. Each mode button (cart, T, $) shows the default text color when off and `var(--pico-primary)` blue when on.
61. No Pico toggle switches in the nav.
62. The burger menu button opens a dropdown with "Uncheck all" and "Copy all data" commands.
63. Tapping outside the burger dropdown closes it.
64. "Uncheck all" unchecks every item and pushes an undo snapshot.
65. "Copy all data" writes all items as `[ ] text` / `[x] text` lines to the clipboard.

### Move within subgroup

66. ↑/↓ move an unchecked item only among other unchecked items; a checked item only among other checked items — the item never crosses the checked/unchecked boundary.

### File architecture

62. `index.html` contains only the HTML shell and CDN link tags — no inline CSS or JS.
63. All custom CSS lives in `docs/style.css` and is loaded via `<link>`.
64. All pure logic lives in `docs/core.js` as an ES module.
65. The Vue app lives in `docs/app.js` as an ES module that imports from `./core.js`.
66. The app loads and functions correctly using the split file structure.

### Tests

67. `node --test tests/` runs without errors.
68. `parseItemText` is tested for quantity+unit, quantity-only, and no-quantity inputs.
69. `parsePriceRaw` is tested for valid and invalid inputs.
70. `normalizePrice` is tested for unit conversions (g→kg, ml→l), null unit (→ €/pc), and unknown unit (→ null).
71. `renderPriceViewText` and `parsePriceViewText` are tested for correctness and round-trip fidelity (including store and info fields).
72. `renderText` and `parseTextLines` are tested for checklist text round-tripping.
