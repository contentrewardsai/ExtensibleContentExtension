# Solana read Metaplex metadata

**Read-only** fetch of the **Metaplex Token Metadata** program PDA for a **mint** (`metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`), parsing on-chain **name**, **symbol**, and **uri** (Borsh-length–prefixed strings). **`metadataFound`** is **`true`** when the account exists and is owned by that program; otherwise **`false`** (empty name/symbol/uri).

Optional **HTTPS-fetch** of the on-chain **`uri`** (`fetchMetaplexUriBody`): the service worker performs a **GET** with **manual redirects** (each hop must stay **https** and pass a **private-host blocklist**), **12s** timeout, **256 KiB** body cap (`uriBodyTruncated`). Row variables **`uriFetchOk`**, **`uriResolvedForFetch`** (exact HTTPS URL used, after **ipfs**/**ipns**/**ar** rewriting), **`uriBody`**, **`uriFetchError`**, **`uriBodyTruncated`** apply when fetch is enabled.

- **`ipfs://…`**, **`ipns://…`**, and **`ar://…`** are rewritten to gateway HTTPS URLs (**`metaplexIpfsGateway`**, **`metaplexIpnsGateway`**, **`metaplexArweaveGateway`**). Defaults: **`https://ipfs.io/ipfs/`**, **`https://ipfs.io/ipns/`**, **`https://arweave.net/`**. An empty path after the scheme yields **`uriFetchError: bad_gateway_uri`**.
- Raw **`http://`** (non-gateway) URIs are rejected at fetch (`not_https`). Other schemes are not handled here.

Token-2022 mints may use other metadata mechanisms; the classic Metaplex PDA may be absent.

## Step

- **`solanaReadMetaplexMetadata`**

## Background

- **`CFS_SOLANA_RPC_READ`** with `readKind` **`metaplexMetadata`** — [`background/solana-swap.js`](../../background/solana-swap.js)

## Requirements

- Valid **mint** and RPC. **No** automation wallet unlock.

## Testing

**steps/solanaReadMetaplexMetadata/step-tests.js** — `npm run build:step-tests && npm run test:unit`
