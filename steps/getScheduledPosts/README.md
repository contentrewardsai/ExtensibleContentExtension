# Get Scheduled Posts

Retrieve **scheduled** (pending) posts for a connected social account. Returns posts that are queued for future publication, with timestamps and content. Uses the backend API at extensiblecontent.com.

## Configuration

| Field | Description |
|-------|-------------|
| **platform** | Social platform (optional filter). |
| **limit** | Max posts to return. |

## Row variables

**saveAsVariable** — JSON array of scheduled post records.

## Background

- **`CFS_GET_SCHEDULED_POSTS`** — `background/social-api.js`

## Testing

**steps/getScheduledPosts/step-tests.js** — `npm run build:step-tests && npm run test:unit`
