# Concat row lists

Builds **`[...A, ...B]`** from two row variables and writes the result to **`saveToVariable`**. Each side uses the same rules as **Filter / slice row list** and **Join row lists** (native array or JSON string for an array or single object).

## Configuration

| Field | Description |
|-------|-------------|
| **Run only if** | Optional. Skips the whole step when false. |
| **First list** / **Second list** | Row keys holding the two arrays. |
| **Save combined list to** | Output row key. |

## Behavior

Uses `Array.prototype.concat`: the original row arrays are **not** mutated; the output is a new array referencing the same element values as A and B.

## Example

- `batch1` and `batch2` are two API result arrays on the row.
- **Concat row lists** → `allItems`.
- **Loop** with **list variable** `allItems`.
