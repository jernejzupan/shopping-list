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
│  [Text ●]  [Shopping ●]  [Store ▼] [💰]   │
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
│  ☐ 2kg  apples          [↑] [↓] [💰]     │  ← toolbar on right
│  ☐      bread            [↑] [↓] [💰]     │
│  ─────────────────────────────────────     │
│  ☑ 500ml milk            [↑] [↓] [💰]     │  ← strikethrough, muted
│                                            │
│  (price view mode — editable textarea)     │
│  - apples                                  │
│    - 2026-03-28 spar 10€/1kg good brand    │
│  - milk                                    │
│    - 2026-03-27 lidl 1.5€/1l               │
│                                            │
└────────────────────────────────────────────┘
```

### Nav Bar (`<nav>`)

- Uses Pico CSS `<nav>` element for structure.
- **Sticky**: `position: sticky; top: 0; z-index: 10;` with a solid background so content scrolls behind it.
- Contains:
  1. The two toggle switches (Text, Shopping).
  2. A **Store** dropdown (`<select>`) — always visible, hardcoded options: `lidl`, `spar`, `other`. Bound to `selectedStore`, persisted in `localStorage`. Pre-fills the store field when opening the price modal.
  3. A **Prices** button (Font Awesome `fa-tags` or `fa-receipt` icon) — toggles `priceViewMode`.
  4. The filter input (checkbox mode only, hidden when `textMode` or `priceViewMode` is on).

### Toggle Switches

Two Pico-styled toggle switches (`<input type="checkbox" role="switch">`) inside the `<nav>`:

- **Text** — toggles `textMode`
- **Shopping** — toggles `shoppingMode`

When `textMode` is switched **off**, the textarea content is parsed immediately.

### Checkbox Mode

Two `<ul>` lists rendered from computed properties:

1. **Unchecked list** — `items.filter(i => !i.checked)` further filtered by `filterText`, preserving array order.
2. **Checked list** — `items.filter(i => i.checked)` further filtered by `filterText`, preserving array order. Items are shown with strikethrough and muted styling.

A divider between the two lists is hidden when either filtered list is empty.

#### Inline Editing

- Clicking on an item's text in checklist view makes it editable (inline `<input type="text">`).
- The input is auto-focused on activation.
- **Blur** (click away) or **Enter**: commits the edit and saves.
- **Escape**: reverts to the original text without saving.
- Implemented via a transient `editing` boolean flag on each item (not persisted).

#### Item Toolbar

Each `<li>` in the checklist has a **fixed right-hand toolbar** containing icon buttons (Font Awesome):

| Button    | Icon            | Visibility         | Action                                                                 |
| --------- | --------------- | ------------------ | ---------------------------------------------------------------------- |
| Move up   | `fa-arrow-up`   | Always             | Swaps item with the previous item in `items` array. Disabled if first. |
| Move down | `fa-arrow-down` | Always             | Swaps item with the next item in `items` array. Disabled if last.      |
| Price     | `fa-calculator` | Shopping mode only | Opens the price calculator modal for this item.                        |

The toolbar is always visible (not hover-only) and positioned on the right side of each list item.

#### Quantity/Unit Display

When an item's text starts with a quantity (and optional unit), it is displayed as a styled badge/prefix (e.g. `<span class="item-qty">2kg</span>`) before the item name in checklist view.

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

A native `<dialog>` element (Pico CSS supports `<dialog>` styling) opened from the item toolbar's price button.

### Layout

```
┌──────────────────────────────────────────────┐
│  Price: apples                               │
├──────────────────────────────────────────────┤
│                                              │
│  [2026-03-28] [spar ▼] [5/1kg] [note...] [+]│  ← add entry form
│                                              │
│  2026-03-28 spar 10€/1kg good brand    [🗑]  │  ← existing entries
│  2026-03-20 lidl  8€/1kg               [🗑]  │   (last 10, date desc)
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
  - Raw price/amount (`<input type="text">`, e.g. `5/1kg` or `2.5/500g`), with a live normalized preview.
  - Info (`<input type="text">`, free-text note, optional).
  - Add button (`fa-plus` icon) appends entry and saves.
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

Returns a normalized per-kg or per-l price string for display (e.g. `5€/kg`).

### `today()`

Returns today's date as `"YYYY-MM-DD"`.

### `renderPriceViewText(priceData)`

Pure function. Takes a `priceData` object, returns the canonical multiline text string (sorted alphabetically, entries by date descending, format: `  - date store price€/amountUnit info`). Used to populate the price view textarea.

### `parsePriceViewText(text)`

Pure function. Parses the editable price view textarea back into a `priceData` object. Returns `{}` if the string is empty or has no valid entries. Silently skips unrecognized lines.

### `renderText(items)`

Pure function. Takes an `items` array, returns the checklist textarea string (`- [x]` / `- [ ]` lines).

### `parseTextLines(raw, existingItems, nextIdStart)`

Pure function. Parses raw checklist text back into items, reusing existing IDs where possible.

```js
// Returns: { items: Array<{id, text, checked}>, nextId: number }
```

---

## Vue Methods

### `toggleCheck(item)`

1. Flip `item.checked`.
2. If `shoppingMode` is **on** and the item just became **checked**:
   - Find `insertIndex` = index of the first unchecked item in `items` (after the flip).
   - Splice the item out of its current position.
   - Insert it at `insertIndex` (it now sits at the bottom of the checked block / top of unchecked block).
3. Call `save()`.

### `startEdit(item)`

Sets `item.editing = true`. On `nextTick`, focuses the inline input.

### `commitEdit(item, newText)`

Updates `item.text`, sets `item.editing = false`, calls `save()`.

### `cancelEdit(item)`

Reverts `item.text` to its pre-edit value, sets `item.editing = false`.

### `moveUp(item)` / `moveDown(item)`

Finds the item's index in `this.items` and swaps it with the adjacent item (previous / next). Calls `save()`. No-op if item is already at the boundary.

### `openPriceModal(item)`

Sets `priceModalItem` to the item name (parsed via `parseItemText`). Resets `priceForm` with `date = today()`, `store = selectedStore`, `raw = ""`, `info = ""`. Opens the `<dialog>`.

### `addPriceEntry()`

Reads `priceForm`. Pushes `{ date, store, price, priceUnit: "€", amount, amountUnit, info }` to `priceData[priceModalItem.toLowerCase()]`, sorts by date descending, calls `save()`.

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

15. Clicking an item's text in checklist view turns it into an editable input field.
16. Pressing Enter or clicking away commits the edit.
17. Pressing Escape cancels the edit and reverts to the original text.
18. The transient `editing` flag is never persisted to `localStorage`.

### Item toolbar

19. Each checklist item displays move-up and move-down icon buttons on the right.
20. Move-up/down correctly reorders items in the `items` array and persists the change.
21. The price button is only visible when `shoppingMode` is on.
22. The toolbar is always visible (not hover-only).

### Units

23. Item text starting with `<number><unit>` (e.g. `2kg`, `500g`, `3`) is parsed and displayed as a quantity badge in checklist view.
24. Supported units: `g`, `kg`, `ml`, `l`. Plain number (no unit) is also accepted.
25. Items with no quantity prefix display normally with no badge.
26. Unit parsing is display-only — the raw `text` field is preserved for text-mode round-tripping.

### Price calculator modal

27. The price button in the toolbar opens a modal for the selected item.
28. The modal shows up to the last 10 price entries sorted by date descending.
29. New entries can be added with date, store, price/amount (raw input), and info note.
30. Entries can be deleted individually.
31. Price data is persisted in `localStorage` under `priceData`, keyed by item name (lowercase).
32. The date input in the modal is wide enough to display the full YYYY-MM-DD value without truncation.

### Store selector

33. A store `<select>` (`lidl`, `spar`, `other`) is always visible in the nav bar.
34. The selected store is persisted to `localStorage` and restored on page load.
35. Opening the price modal pre-fills the store field from the nav selector, but allows per-entry override.
36. Each saved price entry records the store name alongside the other fields.

### Price data text view (editable)

37. The Prices nav button toggles an editable textarea view of all price data.
38. Items in the price view are sorted alphabetically; entries within each item by date descending.
39. Only items with at least one price entry appear in the view.
40. Each entry is rendered as: `  - date store price€/amountUnit info` (info is omitted if empty).
41. Toggling the Prices view off parses the textarea content and overwrites `priceData` with the result, then saves.
42. Entries with no info field round-trip correctly (render/parse with no info produces the same data).
43. Old `localStorage` entries without `store` or `info` fields load without error (default to `""`).

### File architecture

44. `index.html` contains only the HTML shell and CDN link tags — no inline CSS or JS.
45. All custom CSS lives in `docs/style.css` and is loaded via `<link>`.
46. All pure logic lives in `docs/core.js` as an ES module.
47. The Vue app lives in `docs/app.js` as an ES module that imports from `./core.js`.
48. The app loads and functions correctly using the split file structure.

### Tests

49. `node --test tests/` runs without errors.
50. `parseItemText` is tested for quantity+unit, quantity-only, and no-quantity inputs.
51. `parsePriceRaw` is tested for valid and invalid inputs.
52. `normalizePrice` is tested for unit conversions (g→kg, ml→l) and null unit.
53. `renderPriceViewText` and `parsePriceViewText` are tested for correctness and round-trip fidelity (including store and info fields).
54. `renderText` and `parseTextLines` are tested for checklist text round-tripping.
