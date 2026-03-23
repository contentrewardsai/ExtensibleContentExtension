# Audit and hardening report

Summary of security, consistency, and reliability improvements applied to the codebase.

---

## Completed items

### Messaging and storage

- **EXTRACTED_ROWS and PICK_ELEMENT_RESULT:** Delivered to sidepanel via `chrome.storage` (not deprecated port-based messaging). Content script sends updates; sidepanel listens for storage events.
- **AUTO_DISCOVERY_UPDATE:** Same pattern—storage-based delivery to sidepanel.
- **RUN_WORKFLOW:** Validates `workflowId` before starting; returns `{ ok: false, error: '...' }` when workflow not found.

### Step handlers

- **ctx.sendMessage (Promise):** Step handlers use `opts.ctx.sendMessage` for background/offscreen calls; responses handled via Promise.
- **SET_PROJECT_STEP_HANDLERS:** Restricted to extension-origin senders; validates message source.

### Credentials and fallbacks

- **Default API credentials:** Documented as demo-only; not for production.
- **FALLBACK_STEP_IDS:** Minimal set in loader; avoids broad fallbacks.

---

## See also

- **ERROR_CORRECTION_CHECKLIST.md** — Guidelines for playback and step handling
- **REMAINING_IMPLEMENTATION.md** — Audit reference and recent improvements
