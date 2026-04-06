# Apify Dataset Items

Fetch items (results) from an **Apify dataset** by dataset ID. Typically used after `apifyRunWait` to retrieve the scraping results. Returns rows as a JSON array that can be stored in a row variable for downstream processing.

## Configuration

| Field | Description |
|-------|-------------|
| **datasetId** | Apify dataset ID. Supports `{{vars}}`. |
| **limit** | Max items to fetch (optional). |
| **offset** | Skip N items (optional). |
| **fields** | Comma-separated field names to include (optional). |

## Row variables

**saveAsVariable** — JSON array of dataset items.

## Background

- **`CFS_APIFY_DATASET_ITEMS`** — `background/apify.js`

## Testing

**steps/apifyDatasetItems/step-tests.js** — `npm run build:step-tests && npm run test:unit`
