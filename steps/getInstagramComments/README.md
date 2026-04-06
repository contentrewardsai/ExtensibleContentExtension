# Get Instagram Comments

Fetch **comments** on a specific Instagram post. Returns comment text, author, timestamp, and reply count. Useful for engagement workflows and auto-reply logic. Requires Instagram account connection via extensiblecontent.com.

## Configuration

| Field | Description |
|-------|-------------|
| **postIdVariableKey** | Row variable containing the Instagram post/media ID. |
| **limit** | Max comments to return. |

## Row variables

**saveAsVariable** — JSON array of comment records.

## Background

- **`CFS_GET_INSTAGRAM_COMMENTS`** — `background/social-api.js`

## Related steps

- **`replyInstagramComment`** — reply to a specific comment.

## Testing

**steps/getInstagramComments/step-tests.js** — `npm run build:step-tests && npm run test:unit`
