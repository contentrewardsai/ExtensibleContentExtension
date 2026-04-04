# Filter / slice row list

Narrows a **row variable** that holds an array (or a **JSON array string**) so a following **Loop** can use **`listVariable`** on the smaller list.

## Configuration

| Field | Description |
|-------|-------------|
| **Run only if** | Optional. When set, skips this entire step when the condition is false (same rules as other steps). |
| **Source list** | Row key whose value is an array, or a string that parses as a JSON **array** or a single JSON **object** (treated as a one-element list). |
| **Save result to** | Row key to write the new array (can match the source to replace in place). |
| **Keep element when** | Optional. Same expression language as step **`runIf`** (truthy gate, comparisons like `{{status}} === active`, dotted paths). Evaluated **per element**. |
| **Invert** | When checked, **drop** items where the expression is true and **keep** items where it is false (only applies when **Keep element when** is set). |
| **Offset** / **Limit** | Optional, applied **after** filtering. Non-negative integers; omit both to keep full filtered list. |

## Per-element row for **Keep element when**

- If the list element is a **plain object**, the condition sees **`Object.assign({}, parentRow, element)`** — element fields override parent keys with the same name.
- If the element is a **scalar** (string, number, …), use **`{{_item}}`** in the expression (or comparisons involving **`_item`**).

## Example

1. **Send to endpoint** saved `items` as an array of `{ id, status }`.
2. **Filter / slice row list**: source `items`, filter `{{status}} === active`, save to `activeItems`.
3. **Loop** with **list variable** `activeItems`.

**Exclude** a value: set **Keep element when** to e.g. `{{status}} === archived` and enable **Invert** so you keep everything that is *not* archived.
