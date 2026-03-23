# Extract data

Extracts a list from the page (e.g. table rows, list items) into a table of rows. Use **Run All Rows** to process each extracted row with the rest of the workflow.

## Configuration

| Field | Description |
|-------|-------------|
| **List container selector** | CSS selector for the list wrapper (e.g. `table tbody`, `ul`, `[data-list]`). Use **Select on page** to pick it visually. |
| **Item selector (within list)** | CSS selector for each item inside the list (e.g. `li`, `tr`, `[data-index]`). Evaluated in the context of each list container. |
| **Fields to extract** | JSON array of `{ "key": "columnName", "selectors": ["..."] }`. Selectors are evaluated inside each item; text content is taken. |
| **Max items** | Maximum number of items to extract (0 = no limit). |

## Output

- Extracted rows are sent to the sidepanel via storage (`EXTRACTED_ROWS`). The sidepanel replaces or merges **imported rows** with the extracted data.
- Each row is an object with keys from the **Fields** definition; values come from the first matching selector per field per item.
- Use **Test extraction** in the step editor to run extraction on the current page and see the result count before saving.

## Run All Rows

When the workflow runs with **Run All Rows**, the extract step runs once on the current page and produces N rows. The workflow then continues with the next step for each of those rows (or the extract step can be first so the batch is the extracted list).

## Testing

### Unit tests (step-tests.js)

- **buildExtractConfig defaults**: listSelector, itemSelector, fields `[]`, maxItems
- **buildExtractConfig with fields**: field structure validation
