# Send Instagram DM

Send a **direct message** on Instagram to a specific user. Supports text messages with `{{row variables}}` for personalized outreach. Requires Instagram account connection via extensiblecontent.com.

## Configuration

| Field | Description |
|-------|-------------|
| **recipientUserIdVariableKey** | Row variable containing the recipient's Instagram user ID. |
| **text** | Message text (supports `{{vars}}`). |

## Row variables

**saveAsVariable** — send result.

## Background

- **`CFS_SEND_INSTAGRAM_DM`** — `background/social-api.js`

## Testing

**steps/sendInstagramDm/step-tests.js** — `npm run build:step-tests && npm run test:unit`
