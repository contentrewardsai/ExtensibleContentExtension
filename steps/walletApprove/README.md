# walletApprove

Wait for and approve a wallet sign request from a DeFi site.

When the CFS wallet proxy is injected into a DeFi page (e.g., Raydium, PancakeSwap) and the dApp calls `signTransaction`, this step coordinates the approval during workflow playback.

## Inputs

| Field | Description | Default |
|-------|-------------|---------|
| `autoSign` | Auto-sign without user confirmation | `true` |
| `timeout` | Max wait time for sign request (ms) | `30000` |
| `convertToApiCall` | Try to convert the dApp's transaction to a headless API call | `true` |
| `saveSignatureVariable` | Row variable for transaction signature | — |
| `saveExplorerUrlVariable` | Row variable for explorer URL | — |

## Workflow Example

```json
[
  { "type": "goToUrl", "url": "https://app.raydium.io/swap/?inputMint=sol&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  { "type": "wait", "waitMs": 3000 },
  { "type": "type", "selectors": ["[data-testid='swap-input']"], "value": "{{amount}}" },
  { "type": "click", "selectors": ["[data-testid='swap-button']"] },
  { "type": "walletApprove", "autoSign": true, "timeout": 30000, "saveSignatureVariable": "txSig" }
]
```
