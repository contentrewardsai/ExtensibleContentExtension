# Get Analytics

Fetch aggregated **analytics** (followers, engagement, reach) for connected social accounts. Returns platform-level metrics over a configurable date range. Uses the backend API at extensiblecontent.com.

## Configuration

| Field | Description |
|-------|-------------|
| **platform** | Social platform (e.g. `instagram`, `youtube`, `tiktok`). |
| **dateRange** | Date range for metrics (e.g. `7d`, `30d`). |

## Row variables

**saveAsVariable** — JSON analytics object.

## Background

- **`CFS_GET_ANALYTICS`** — `background/social-api.js`

## Testing

**steps/getAnalytics/step-tests.js** — `npm run build:step-tests && npm run test:unit`
