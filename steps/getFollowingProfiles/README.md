# Get Following Profiles

List all **Following/Pulse** profiles. Optionally filter by name pattern or account platform. Returns an array of profile summaries.

## Configuration

| Field | Description |
|-------|-------------|
| **filterName** | Optional name filter (substring match). |
| **filterPlatform** | Optional platform filter (e.g. `instagram`, `twitter`). |
| **limit** | Max profiles to return. |

## Row variables

**saveAsVariable** — JSON array of profile summaries.

## Background

- **`QUERY_FOLLOWING`** with `action: 'getProfiles'`

## Testing

**steps/getFollowingProfiles/step-tests.js** — `npm run build:step-tests && npm run test:unit`
