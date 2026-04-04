# Write JSON to project file

Writes **JSON** to a path **relative to the project folder** (the folder selected in the side panel). Data can come from a **row variable** (object or JSON string) or a **literal** string after template resolution. Optional **shallow merge** reads an existing file and merges top-level keys.

## Step

- **`writeJsonToProject`**

## Background

- **`CFS_PROJECT_READ_FILE`** — read existing JSON when `mergeMode` is `shallowMerge`
- **`CFS_PROJECT_WRITE_FILE`** — write UTF-8 content

## Fields

| Field | Notes |
|--------|--------|
| `relativePath` | Required; supports `{{var}}` |
| `dataSource` | `variable` (default) or `literal` |
| `dataVariable` | Row key when source is variable |
| `jsonLiteral` | String parsed as JSON when source is literal |
| `mergeMode` | `replace` or `shallowMerge` / `shallow_merge` |

## Testing

**steps/writeJsonToProject/step-tests.js** — `npm run build:step-tests && npm run test:unit`
