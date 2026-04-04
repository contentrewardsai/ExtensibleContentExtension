# Join row lists

Combines two **arrays of plain objects** stored on the current row into one array, matching **`leftKey`** on each left element to **`rightKey`** on each right element. Key values are compared as **strings** after resolution (`1` matches `"1"`).

## Configuration

| Field | Description |
|-------|-------------|
| **Run only if** | Optional. Skips the whole step when false. |
| **Left list** / **Right list** | Row variable names; each value is an array or a JSON string parsing to an **array** or a single **object** (wrapped as one element), same as **Filter / slice row list**. |
| **Left key** / **Right key** | Path on each object (`CFS_templateResolver.getByLoosePath`), e.g. `id` or `data.id`. |
| **Join type** | **Left**: every left row appears; unmatched rows are copied as-is. **Inner**: only rows with a matching key on the right. |
| **Prefix right fields** | Optional string (e.g. `r_`). Every **own** key from the matched right object is written as `prefix + key`, so left fields with the same name are not overwritten. |
| **Save merged list to** | Row variable for the output array. |

## Merge semantics

Without a prefix: each output element is **`Object.assign({}, leftRow, rightRow)`** — shared keys take the **right** value.

With **Prefix right fields**: the right side is merged as `{ [prefix + k]: right[k] for each own key k }`, then assigned after the left row (same as un-prefixed assign order).

If several right rows share the same join key, the **last** one in the right array wins.

## Example

- `ids` = `[{ id: "a" }, { id: "b" }]`
- `details` = `[{ id: "a", name: "A" }]`
- Left join on `id` → `merged` = `[{ id: "a", name: "A" }, { id: "b" }]`

Then **Loop** with **list variable** `merged`.
