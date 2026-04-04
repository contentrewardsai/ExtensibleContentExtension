# Solana read mint

**Read-only** **`getMint`** for a SPL mint: **decimals**, **supply**, **initialized**, **mintAuthority** / **freezeAuthority** (base58 or empty when revoked).

Optional **`includeMetaplexMetadata`**: one message runs **`getMint`** and the Metaplex metadata PDA read **in parallel** (`Promise.all`). Response adds **`metadataFound`**, **`metadataAccount`**, **`name`**, **`symbol`**, **`uri`**, **`updateAuthority`** (same semantics as **`solanaReadMetaplexMetadata`** on-chain fields).

Optional **`fetchMetaplexUriBody`** (requires **`includeMetaplexMetadata`**) runs the same HTTPS **`uri`** fetch as **`readKind: metaplexMetadata`** / **`solanaReadMetaplexMetadata`** (gateways, caps, **`uriFetchOk`** / **`uriBody`** / etc.). Message validation rejects **`fetchMetaplexUriBody`** without **`includeMetaplexMetadata`**.

## Step

- **`solanaReadMint`**

## Background

- **`CFS_SOLANA_RPC_READ`** with `readKind` **`mintInfo`** and optional **`includeMetaplexMetadata`** — [`background/solana-swap.js`](../../background/solana-swap.js)

## Requirements

- Valid **mint** and RPC. **No** automation wallet unlock.

## Testing

**steps/solanaReadMint/step-tests.js** — `npm run build:step-tests && npm run test:unit`
