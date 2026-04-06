# Get Facebook Pages

Retrieve **Facebook Pages** managed by the connected user. Returns page names, IDs, access tokens, and follower counts. Used to select a page for posting via `uploadPost`. Requires Facebook account connection via extensiblecontent.com.

## Configuration

| Field | Description |
|-------|-------------|
| **limit** | Max pages to return (optional). |

## Row variables

**saveAsVariable** — JSON array of Facebook Page records.

## Background

- **`CFS_GET_FACEBOOK_PAGES`** — `background/social-api.js`

## Testing

**steps/getFacebookPages/step-tests.js** — `npm run build:step-tests && npm run test:unit`
