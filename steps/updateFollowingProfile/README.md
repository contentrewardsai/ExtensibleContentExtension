# Update Following Profile

Update an existing **Following/Pulse** profile: change name/birthday, or add accounts, phone numbers, emails, addresses, and notes.

## Configuration

| Field | Description |
|-------|-------------|
| **profileIdVariableKey** | Row variable containing the profile ID. |
| **profileNameVariableKey** | Row variable for name lookup (alternative). |
| **nameVariableKey** | New name (optional). |
| **birthdayVariableKey** | New birthday (optional). |
| **addAccountHandleVariableKey** | Add social account handle. |
| **addAccountPlatformVariableKey** | Platform for the new account. |
| **addAccountUrlVariableKey** | URL for the new account. |
| **addPhoneVariableKey** | Add phone number. |
| **addEmailVariableKey** | Add email address. |
| **addAddressVariableKey** | Add address (JSON). |
| **addNoteVariableKey** | Add note text. |

## Row variables

**saveAsVariable** — update result.

## Background

- **`MUTATE_FOLLOWING`** with `action: 'updateProfile'`

## Testing

**steps/updateFollowingProfile/step-tests.js** — handler registration. `npm run build:step-tests && npm run test:unit`
