# Following (Pulse)

The extension stores **Following** data (profiles and their platform accounts) under this folder when a **project folder** is set. One subfolder per account keeps data separate when you log in and out.

## Layout

- **following/** – Root (this folder). Created automatically when you save Following data and a project folder is set.
- **following/{account}/** – One folder per logged-in user. When not logged in, the extension uses `_local`. The account name is sanitized for the filesystem (e.g. `johncooknyc_gmail_com`).
- **following/{account}/{profile_id}.json** – One JSON file per Following profile. The filename is the profile’s id (sanitized). Each file contains the profile, its accounts, and optional **on-chain wallets** (watch + address metadata; **Following automation is configured in Library workflows**, not here).

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
  ],
  "wallets": [
    {
      "id": "fw_1739123456789_ab12",
      "profile": "fp_1739123456789_abc12xyz",
      "chain": "solana",
      "address": "YourSolanaBase58AddressHere",
      "network": "mainnet-beta",
      "label": "Trading wallet",
      "deleted": false,
      "watchEnabled": true,
      "automationEnabled": false,
      "autoExecuteSwaps": false,
      "sizeMode": "off",
      "quoteMint": "",
      "fixedAmountRaw": "",
      "usdAmount": "",
      "proportionalScalePercent": 100,
      "slippageBps": 50
    }
  ]
}
```

**`chain`** is `solana` or `evm` (with **`network`** such as `bsc`, `chapel` (BSC testnet), or `ethereum` for EVM). Solana / BSC **watch** polling is implemented in the service worker when **`watchEnabled`** is true. **Following automation** uses **always-on workflows**: **`selectFollowingAccount`** (bind profile + address) + **`workflow.followingAutomation`** (modes, quote mint, slippage, paper, Jupiter options). **Global token blocklist** and **emergency pauses** live in **`cfsFollowingAutomationGlobal`** in **`chrome.storage.local`** — see **`docs/FOLLOWING_AUTOMATION_PIPELINE.md`**, **docs/SOLANA_AUTOMATION.md**, and **docs/BSC_AUTOMATION.md**. Wallet rows use **`automationEnabled`**, **`sizeMode`**, **`quoteMint`**, etc.; sizing for bound wallets is primarily workflow-driven. This data is **local / file-first**; the API may add a **`wallets`** column when the backend is extended (see **docs/BACKEND_IMPLEMENTATION_PROMPT.md** § `following` table).

## Chrome storage (Pulse Following automation)

The extension stores **`cfsFollowingAutomationGlobal`** (pauses + **`globalTokenBlocklist`**) and per-chain watch bundles under **`chrome.storage.local`**.

## Behaviour

- **Project folder set:** Load and save use **following/{account}/** under the project folder. Each profile is one JSON file; adding or removing profiles adds or removes files.
- **Project folder not set:** The extension falls back to Chrome local storage (no files here).
- **Transfer between accounts:** Copy or move any `*.json` from **following/account_a/** to **following/account_b/** (or another account folder). After opening Pulse (or syncing), those profiles and accounts appear for that account.

## Requirements

Set the project folder in the side panel (**Automations → Set project folder**) so the extension can create and use **following/** under it. The same project folder is used for **workflows/** and other features.
