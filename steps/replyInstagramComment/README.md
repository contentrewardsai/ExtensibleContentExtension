# Reply Instagram Comment

Reply to a specific **Instagram comment** on a post. Sends a text reply using the Instagram Graph API. Supports `{{row variables}}` in the reply text for personalized responses. Requires Instagram account connection via extensiblecontent.com.

## Configuration

| Field | Description |
|-------|-------------|
| **commentIdVariableKey** | Row variable containing the comment ID to reply to. |
| **text** | Reply text (supports `{{vars}}`). |

## Row variables

**saveAsVariable** — reply result (comment ID of the reply).

## Background

- **`CFS_REPLY_INSTAGRAM_COMMENT`** — `background/social-api.js`

## Related steps

- **`getInstagramComments`** — fetch comments to find IDs.

## Testing

**steps/replyInstagramComment/step-tests.js** — `npm run build:step-tests && npm run test:unit`
