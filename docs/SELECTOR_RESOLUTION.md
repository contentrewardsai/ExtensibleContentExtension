# Selector Resolution: When to Use Which

This doc explains the two selector resolution approaches in the extension and when to use each.

---

## Two approaches

### 1. `findElementByCssStrings(doc, cssStrings)` (minimal)

- **Location:** `shared/selectors.js`
- **Input:** Array of plain CSS selector strings, e.g. `["#login-btn", "[data-testid='submit']"]`
- **Behavior:** Iterates over strings, returns the first element from `document.querySelector(selector)`
- **Use when:** You only have CSS strings and need a small, self-contained lookup

**Use cases:**
- **Tutorial loader** (`shared/tutorial-loader.js`) – Standalone script embedded on third-party pages; config has `step.selectors` as strings
- **Exported walkthrough runner** – Inline script from `buildWalkthroughRunnerScript`; no access to full selector library
- **Embedded walkthroughs** – Host page includes one script; config built by `selectorStrings(action)` from `shared/walkthrough-export.js` when exporting walkthrough

### 2. `resolveElement(selectors, doc)` (rich)

- **Location:** `shared/selectors.js`
- **Input:** Array of selector objects, e.g. `{ type: 'id', value: '#btn', score: 10 }`, `{ type: 'role', value: { role: 'button', name: 'Submit' }, score: 7 }`, etc.
- **Behavior:** Uses `tryResolveWithSelector()` to support many strategies: `id`, `attr`, `attrContains`, `class`, `role`, `text`, `textContains`, `xpath`, `cssPath`, `ancestorDescendant`, `xpathText`, etc. Sorts by score and tries each until one matches
- **Use when:** You have full selector records from recording or similar rich data

**Use cases:**
- **Player** (`content/player.js`) – Playback of recorded workflows; actions have `selectors` and `fallbackSelectors` as rich objects
- **Recorder** – Uses `generateSelectors` and `generatePrimaryAndFallbackSelectors` to capture full selector objects (via **`window.CFS_selectors`** when present, per manifest order, else globals)
- **Auto-discovery** – Uses selector resolution for pattern matching across runs

---

## Data flow

```
Recording:  generateSelectors(el) → [{ type, value, score }, ...]
                    ↓
Storage:    action.selectors, action.fallbackSelectors (rich format)
                    ↓
Export:     actionSelectorsToCssStrings(action) [selectors.js] or selectorStrings(action) [walkthrough-export.js]
                    ↓
            ["#btn", "[data-testid='x']"]  (CSS strings only)
                    ↓
Embedded:   findElementByCssStrings(doc, strings)  (minimal resolution)

Playback:   resolveElement(selectors, doc)  (full resolution)
```

---

## Helper functions

| Function | Location | Purpose |
|----------|----------|---------|
| `actionSelectorsToCssStrings(action)` | `shared/selectors.js` | Extract CSS strings from `action.selectors` and `action.fallbackSelectors` (handles `{ type, value }`, `{ selector }`, plain strings) |
| `selectorStrings(action)` | `shared/walkthrough-export.js` | Same purpose when building walkthrough config from workflow actions |
| `findElementByCssStrings(doc, cssStrings)` | `shared/selectors.js` | Try each CSS string with `querySelector`, return first match |
| `resolveElement(selectors, doc)` | `shared/selectors.js` | Resolve using full selector objects; supports role, text, xpath, etc. |
| `resolveAllElements(selectors, doc)` | `shared/selectors.js` | Same as above but returns all matches (for list/item selectors) |
| `resolveAllCandidates(selectors, doc)` | `shared/selectors.js` | Returns `[{ element, selector }]` for each selector that finds an element |

---

## Choosing an approach

| Scenario | Use | Reason |
|----------|-----|--------|
| Embedded walkthrough on a third-party page | `findElementByCssStrings` | Self-contained; config only has CSS strings; cannot load full selectors.js |
| Extension player during playback | `resolveElement` | Actions have rich selectors; multiple strategies improve robustness on dynamic pages |
| Recording a click | `generateSelectors` / `generatePrimaryAndFallbackSelectors` | Capture full selector objects for later playback |
| Exported runner script (inlined string) | Logic equivalent to `findElementByCssStrings` | No module loading; config built with `selectorStrings(action)` |
| Extracting strings from workflow for export | `actionSelectorsToCssStrings` (selectors.js) or `selectorStrings` (walkthrough-export.js) | Converts rich selectors to CSS strings; use `selectorStrings` when building walkthrough config |

---

## Selector management in the step editor

The sidepanel step editor displays all selector strategies (primary and fallback) for each step as interactive cards. Each card shows the selector **type** (id, attr, class, role, text, xpath, cssPath, etc.), **value**, **score**, and **stability label** (Stable, Likely stable, OK, May change — computed by `scoreSelectorString()`).

Actions available per step:
- **Test** — Resolve a single selector against the current tab and highlight the matched element.
- **Test all** — Test every selector (primary + fallback) and show pass/fail per card.
- **Add** — Manually add a CSS selector.
- **Remove** — Delete a selector from the list.
- **Reorder** — Drag-and-drop to change priority order.
- **Re-generate from page** — Inject `shared/selectors.js` into the current tab, resolve the element using existing selectors, then call `generatePrimaryAndFallbackSelectors()` to refresh the list.
- **Select on page** — Click an element in the active tab to set it as the target (generates selectors automatically).
