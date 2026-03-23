# Following (Pulse)

The extension stores **Following** data (profiles and their platform accounts) under this folder when a **project folder** is set. One subfolder per account keeps data separate when you log in and out.

## Layout

- **following/** – Root (this folder). Created automatically when you save Following data and a project folder is set.
- **following/{account}/** – One folder per logged-in user. When not logged in, the extension uses `_local`. The account name is sanitized for the filesystem (e.g. `johncooknyc_gmail_com`).
- **following/{account}/{profile_id}.json** – One JSON file per Following profile. The filename is the profile’s id (sanitized). Each file contains the profile and its accounts.

## File format

Each `{profile_id}.json` file looks like:

```json
{
  "profile": {
    "id": "fp_1739123456789_abc12xyz",
    "name": "Blake Toves",
    "user": "johncooknyc@gmail.com",
    "deleted": false
  },
  "accounts": [
    {
      "id": "...",
      "handle": "blaketoves",
      "platform": "threads",
      "url": "https://www.threads.com/@blaketoves",
      "profile": "fp_1739123456789_abc12xyz",
      "deleted": false
    }
  ]
}
```

## Behaviour

- **Project folder set:** Load and save use **following/{account}/** under the project folder. Each profile is one JSON file; adding or removing profiles adds or removes files.
- **Project folder not set:** The extension falls back to Chrome local storage (no files here).
- **Transfer between accounts:** Copy or move any `*.json` from **following/account_a/** to **following/account_b/** (or another account folder). After opening Pulse (or syncing), those profiles and accounts appear for that account.

## Requirements

Set the project folder in the side panel (**Automations → Set project folder**) so the extension can create and use **following/** under it. The same project folder is used for **workflows/** and other features.
