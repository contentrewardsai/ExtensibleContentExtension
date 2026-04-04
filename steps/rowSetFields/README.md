# Set row fields (template)

Sets **top-level** row keys in two ways:

1. **Raw copies** (optional) — copy from a **path on the current row** into a key using `CFS_templateResolver.getByLoosePath`. Values stay as **objects, arrays, numbers, etc.** (no stringification).
2. **Field map** — same `{{variable}}` rules as **Send to endpoint** (`CFS_templateResolver.resolveTemplate`), including **`{{stepCommentText}}`** / **`{{stepCommentSummary}}`**. Every **field map** value becomes a **string**.

**Order:** raw copies run first, then field map (so templates can use keys filled by raw copies).

You can use **only** raw copies (omit or empty **`fieldMap`**) or **only** templates (empty **`rawCopies`**). If both are empty, the step does nothing.

## Configuration

| Field | Description |
|-------|-------------|
| **Run only if** | Optional. Same as other steps: skip when empty/falsy or when the expression is false. |
| **Raw copies** | Optional JSON **array** of `{ "to": "rowKey", "fromPath": "nested.path[0].id" }`. Alias: **`from`** for `fromPath`, **`target`** for `to`. |
| **Field map** | JSON object: each **key** is a row variable name to set; each **value** is a template string. |

## Path syntax (raw copies)

Same as elsewhere: dot segments and bracket indices, JSON strings under a key are parsed when walking deeper (`getByLoosePath`).

## Example

Lift a nested API blob then build a URL string:

**Raw copies:** `[{ "to": "item", "fromPath": "response.data.items[0]" }]`

**Field map:** `{ "title": "{{item.title}}", "link": "https://x.com/{{item.id}}" }`

## Example (templates only)

After a row has `host` and `id`:

```json
{ "pageUrl": "{{host}}/item/{{id}}", "source": "workflow" }
```

sets `pageUrl` and `source` for later steps or **Loop** / **runIf**.
