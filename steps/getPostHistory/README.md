# Get Post History

Retrieve the **post history** (published posts) for a connected social account. Returns post IDs, timestamps, captions, and basic metrics. Uses the backend API at extensiblecontent.com.

## Configuration

| Field | Description |
|-------|-------------|
| **platform** | Social platform. |
| **limit** | Max posts to return. |
| **pageToken** | Pagination token (optional). |

## Row variables

**saveAsVariable** — JSON array of post records.

## Background

- **`CFS_GET_POST_HISTORY`** — `background/social-api.js`

## Testing

**steps/getPostHistory/step-tests.js** — `npm run build:step-tests && npm run test:unit`
