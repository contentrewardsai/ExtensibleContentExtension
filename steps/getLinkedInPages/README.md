# Get LinkedIn Pages

Retrieve **LinkedIn Pages** (company/organization pages) managed by the connected user. Returns page names, IDs, and follower counts. Used to select an organization for posting. Requires LinkedIn account connection via extensiblecontent.com.

## Configuration

| Field | Description |
|-------|-------------|
| **limit** | Max pages to return (optional). |

## Row variables

**saveAsVariable** — JSON array of LinkedIn Page records.

## Background

- **`CFS_GET_LINKEDIN_PAGES`** — `background/social-api.js`

## Testing

**steps/getLinkedInPages/step-tests.js** — `npm run build:step-tests && npm run test:unit`
