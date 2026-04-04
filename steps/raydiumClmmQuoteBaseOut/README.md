# Raydium CLMM quote (exact out)

Read-only **quote** when you know the exact **output** amount. **`CFS_RAYDIUM_CLMM_QUOTE_BASE_OUT`** — no transaction.

## Step

- **`raydiumClmmQuoteBaseOut`**

## Typical use

1. Quote to row vars (defaults: `clmmQuoteMaxInRaw`, `clmmQuoteExpectedInRaw`).
2. Run **raydiumClmmSwapBaseOut** with `amountInMaxRaw: {{clmmQuoteMaxInRaw}}` if you want caps aligned to the quote.

## Background

- **`CFS_RAYDIUM_CLMM_QUOTE_BASE_OUT`** — `background/raydium-clmm-swap.js`

## Related

- **steps/raydiumClmmSwapBaseOut/README.md** — execute swap  
- **steps/raydiumClmmQuoteBaseIn/README.md** — fixed-in quote  

## Testing

**steps/raydiumClmmQuoteBaseOut/step-tests.js** — `npm run build:step-tests && npm run test:unit`
