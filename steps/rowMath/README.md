# Row math

Reads values from the **current row** by variable name, optionally drills into **JSON** under that variable (nested objects, arrays, or a JSON string value), parses numbers (strings with `$` and commas allowed), then either:

- **Arithmetic / percent / min / max / abs / neg:** writes a number to **`saveResultVariable`**
- **Compare (`gt`, `gte`, `lt`, `lte`, `eq`):** writes **`true` / `false`** to **`saveBooleanVariable`**

## JSON path (nested payloads)

If a step saved an object or JSON string on the row (e.g. **get post analytics** → `saveAsVariable`), set **Left variable** / **Right variable** to that row key and use **Left JSON path** / **Right JSON path** to reach a numeric leaf.

Path syntax (same as **`CFS_templateResolver.getByLoosePath`**):

- Dot segments: `stats.views`, `data.metrics.count`
- Array indices: `items[0].price`, `series[1][2]`

If the row value at the variable is a **JSON string**, it is parsed automatically when walking deeper.

**Unary ops (`abs`, `negate`):** only **left** variable (and optional left path) are used; leave **right** blank.

## Percent change

Default **`percentChangeBase`:** `oldNew` — **left** is the base (e.g. entry), **right** is the new value:

\[
\frac{\text{right} - \text{left}}{\text{left}} \times 100
\]

`newOld` uses **right** as the denominator and \(\text{left} - \text{right}\) in the numerator.

## `runIf` on *other* steps (player)

The content **player** evaluates each step’s **`runIf`** before running it (including steps inside **loop** bodies and **nested workflows**). Several steps that also read **`runIf` inside their handler** (e.g. **get post analytics**, **upload post**, **render Shotstack**) use the same **`CFS_runIfCondition`** helper so behavior matches the player when a step runs outside the main loop path.

### Single value (legacy)

- Row key or `{{key}}`: run the step when the value is truthy (not `undefined`, `null`, `''`, `false`, or **`0`**).

### Dot / bracket path without comparison

If the text contains `.` or `[` (e.g. `analytics.impressions` or `{{postStats.metrics.views}}`), the player resolves it with **`getByLoosePath`** from the row root (JSON string values are parsed when walking).

### Template comparison (one binary expression)

When **`runIf`** contains a comparator, the whole string is parsed as **left OP right**:

- Operators (longest match first): `>=`, `<=`, `===`, `!==`, `==`, `!=`, `>`, `<` (`===` / `!==` behave like `==` / `!=` here; numeric coercion applies the same way)
- Each side can be:
  - **`{{path.from.row}}`** — loose path from the row (dots + `[index]`, JSON strings parsed when descending)
  - A numeric literal (e.g. `10`, `-2.5`, `1e3`)
  - A simple identifier `foo` — same as row path `foo`

Examples:

- `{{gainPct}} >= 10`
- `{{lastPrice}} > {{entryPrice}}`
- `{{stats.views}} > 1000`

Only **one** comparison per `runIf` string. If the right side contained another bare operator outside `{{ }}`, the expression is rejected and falls through to legacy behavior (avoid ambiguous strings).

Comparison uses **numeric** coercion when both sides parse as finite numbers; otherwise **string** equality / ordering.

### Branching caveat

Prefer **boolean** row variables from **row math** compare ops for branching; **`runIf`** still treats numeric **`0`** as skip in the **single-variable** form.

## This step’s `runIf`

Uses **`CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)`** (same rules as the player). Loaded from **`shared/run-if-condition.js`** in the content script bundle.

## Options (row math step)

| Field | Notes |
|--------|--------|
| `runIf` | Optional gate for this step; same semantics as workflow **runIf** (see above). |
| `treatEmptyAs` | `error` (default) or `zero` for missing/empty operands. |
| `roundDecimals` | If set (≥ 0), round the numeric result and use rounded values for comparisons. |
| `failWhenCompareFalse` | If true, **throw** when the comparison is false. |

## Tests

`steps/rowMath/step-tests.js` — run via **`npm run test:unit`** (see **steps/TESTING.md**).
