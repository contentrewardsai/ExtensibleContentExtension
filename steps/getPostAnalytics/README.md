# Get Post Analytics

Fetch analytics for a **specific post** — views, likes, comments, shares, reach, impressions. Uses the backend API at extensiblecontent.com. Requires a connected social account.

## Configuration

| Field | Description |
|-------|-------------|
| **postIdVariableKey** | Row variable containing the post ID. |
| **platform** | Social platform. |

## Row variables

**saveAsVariable** — JSON post analytics object.

## Background

- **`CFS_GET_POST_ANALYTICS`** — `background/social-api.js`

## Testing

**steps/getPostAnalytics/step-tests.js** — `npm run build:step-tests && npm run test:unit`
