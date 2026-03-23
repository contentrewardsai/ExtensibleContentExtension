# Error correction checklist

When adding or changing playback, step handlers, or the sidepanel run UI, keep the following so that **failed steps** still get **scroll-to-step** without breaking.

## 1. Player (content/player.js)

- **Step handlers must throw on failure.** The player catches in `executeNext` and sends `{ ok: false, error: err.message, actionIndex }`. Do not return a failure flag; throw an `Error`.
- **Always include `actionIndex`** in any `sendResponse` that reports playback failure (e.g. element not found, timeout). The sidepanel uses it to scroll to the failing step.
- **Optional:** Attach `err.rowFailureAction` on the error if your code has custom recovery semantics; the player forwards it in the response.
- **New code paths** (e.g. optional diagnostics) must **never block** `executeNext` or change the failure response. Use try/catch and skip on error so playback continues.

## 2. Step handlers (steps/*/handler.js)

- **Use `opts.ctx`** for resolution and helpers. Do not rely on globals.
- **Prefer `ctx.resolveElementForAction(action, doc)`** (or `resolveAllCandidatesForAction`) so the player’s merge of `action.selectors` and `action.fallbackSelectors` is used. If you merge manually, use `[].concat(action.selectors || [], action.fallbackSelectors || [])` before calling `ctx.resolveElement`.
- **Throw on failure** with a clear message (e.g. `throw new Error('Button not found')`). The player will report `actionIndex` and the sidepanel will scroll to the step.

See **steps/README.md** § Error handling and **steps/CONTRACT.md**.

## 3. Sidepanel (sidepanel/sidepanel.js)

- **On playback failure** (`res.ok === false`), use `res.actionIndex` to scroll to the failing step (`scrollToStepAndExpand(res.actionIndex)`) and to build the status message (e.g. “Run N failed at step M (type): message”).
- **Do not overwrite or drop `actionIndex`** when forwarding player responses. Connection/scripting errors can be normalized for display but should still allow the user to retry or reload; for those, scrolling to a step may be skipped.

## 4. Fallback selectors (auto-generated)

- **During recording**, fallback selectors are **automatically generated** from the same element via `generatePrimaryAndFallbackSelectors` (shared/selectors.js): primary = best 1 by score, fallbacks = remaining strategies (id, data-*, aria, role, class, text, xpath, etc.). The recorder uses this for click, type, select, upload, checkbox/radio, and **hover** (pending hover target). Do not remove or bypass this so playback can try alternatives when the primary selector fails.

- **Ambiguous CSS during playback:** Many strategies resolve with **`querySelector`** (first match in document order), not “all matches must agree.” **Enrich → Preview merge** runs **selector parity** on the live tab and may **replace** overshooting entries with `:nth-of-type` or `cssPath` refinements so the stored chain is not silently ambiguous. If you add new selector types or resolution paths, keep failure messages actionable (`actionIndex` unchanged).

## 5. New features

Before shipping a change that touches playback or step execution:

1. Does the player still send `actionIndex` on every failure path?
2. Do new or modified step handlers throw (and use ctx for resolution)?
3. Does the sidepanel still scroll to the failing step when `actionIndex` is present and the error is a normal playback failure?
4. Are any new async or optional checks (e.g. divergence hint) non-blocking and wrapped in try/catch so they never replace or swallow the normal failure response?
5. **New step types or generator templates:** Do they avoid changing player response shape or sidepanel failure handling? (New steps should use `opts.ctx` and throw on failure; templates run in the offscreen runner and should not affect playback.)

---

**References:** WORKFLOW_SECTIONS_AND_OUTPUTS_SPEC.md (§2.4), steps/README.md (§ Error handling), steps/CONTRACT.md. For manual verification after changes, see **TESTING.md** (§ Manual test checklist).
