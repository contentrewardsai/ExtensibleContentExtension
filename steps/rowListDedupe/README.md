# Dedupe row list

Collapses a list of **plain objects** on the current row to one row per distinct value at **`dedupeKey`** (dot/bracket path, same as **Join row lists**).

## Configuration

| Field | Description |
|-------|-------------|
| **Run only if** | Optional. |
| **Source list** / **Save deduped list to** | Row variable names (can be the same to replace in place). |
| **Dedupe key** | Path on each object, e.g. `id` or `meta.id`. |
| **Keep first** | If checked, the **first** occurrence of each key wins. If unchecked (default), the **last** wins (same spirit as duplicate join keys on the right in **Join row lists**). |

## Missing keys

If **`dedupeKey`** resolves to **`undefined`** or **`null`** on an element, that element is **always kept** — those rows are not merged with each other.

## Requirements

Every list element must be a **plain object** (not an array or primitive).

## Example

`items` = `[{ id: 1, v: 'a' }, { id: 1, v: 'b' }, { id: 2, v: 'c' }]` with key `id`, keep last → `[{ id: 1, v: 'b' }, { id: 2, v: 'c' }]`.
