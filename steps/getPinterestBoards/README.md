# Get Pinterest Boards

Retrieve **Pinterest boards** owned by the connected user. Returns board names, IDs, description, and pin counts. Used to select a board for pinning via `uploadPost`. Requires Pinterest account connection via extensiblecontent.com.

## Configuration

| Field | Description |
|-------|-------------|
| **limit** | Max boards to return (optional). |

## Row variables

**saveAsVariable** — JSON array of Pinterest Board records.

## Background

- **`CFS_GET_PINTEREST_BOARDS`** — `background/social-api.js`

## Testing

**steps/getPinterestBoards/step-tests.js** — `npm run build:step-tests && npm run test:unit`
