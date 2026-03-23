# Loop

Repeats a sequence of steps either **N times** (count) or **once per item** in a row array (list variable). Use **Loop over list** when you have a row variable that is an array (e.g. from Extract data or an API); use **Repeat count** for a fixed number of iterations. Nested steps can reference the current item and index via `{{item}}` and `{{itemIndex}}` (or custom names).

## Configuration

| Field | Description |
|-------|-------------|
| **Loop over list (row variable)** | Row variable name whose value is an **array**. When set, the loop runs once per element; **Repeat count** is ignored. Example: `urls` when the row has `urls: ["a", "b", "c"]`. |
| **Repeat count** | Used when **Loop over list** is empty. Number of times to run the nested steps (min 1). |
| **Item variable name** | Variable name for the current element in the list (default `item`). Use `{{item}}` in nested steps (e.g. in Run generator input map or Send to endpoint URL). |
| **Index variable name** | Variable name for the current index (default `itemIndex`). Use `{{itemIndex}}` in nested steps. |
| **Wait between iterations** | JSON: `{ "type": "time", "minMs": 500, "maxMs": 1500 }` for a random delay, or `{ "type": "element", "selectors": ["..."], "timeoutMs": 10000 }` to wait for an element. |
| **Steps** | JSON array of **nested actions** (e.g. `runWorkflow` or other step types). Executed in order for each iteration. |

## Behavior

- When **Loop over list** is set, the player resolves the row variable; if it’s an array, each iteration gets `item` = current element and `itemIndex` = 0-based index. Nested steps can use `{{item}}` and `{{itemIndex}}` in their config (e.g. URL, body, input map).
- When **Loop over list** is empty, the loop runs **Repeat count** times; `item` and `itemIndex` are still available (e.g. `itemIndex` from 0 to count−1).
- **Steps** are typically **Run workflow** steps (nested workflow IDs) or other actions; the player executes them in sequence per iteration.
- **Wait between iterations** runs after each iteration (except the last) so you can throttle or wait for the page.

## Testing

### Unit tests (step-tests.js)

- **defaultAction type**: step type contract
