# Project notes and policies

Notes for maintainers and contributors. Not part of the end-user docs.

---

## Chrome version support

**Chrome 116 or later** is required for full functionality. The extension uses:

- `chrome.runtime.getContexts` with `OFFSCREEN_DOCUMENT` (Chrome 116+)
- `chrome.sidePanel` (Chrome 114+)
- `chrome.offscreen` (Chrome 109+)
- `chrome.scripting` (Chrome 88+)
- `wasm-unsafe-eval` in CSP for sandbox/Transformers.js (Chrome 97+)

On Chrome 114–115, **Pulse** and **Activity** tabs work; **Plan** and **Library** show an upgrade prompt. The extension may not load on Chrome &lt; 114 (side panel API missing). See `sidepanel/sidepanel.js` (`MIN_CHROME_VERSION`, `RESTRICTED_TABS`) for the in-app logic.

---

## Do not connect to external LLM/AI services

**Policy (for now):** The extension must **not** connect to external LLM or AI APIs (e.g. OpenAI, Anthropic, or any third-party chat/completion endpoint).

- The **LLM step** uses only the **local LaMini model** (Xenova/LaMini-Flan-T5-783M) in the QC sandbox via Transformers.js. No outbound calls to external AI services. Weights are not in the repo (size); after the user sets a **project folder**, the side panel downloads them to `models/Xenova/` (or use `scripts/download-lamini-model.sh`).
- Do **not** add:
  - External LLM provider options (e.g. “OpenAI”, “External API”).
  - API keys or endpoints for third-party AI services.
  - Fetch/XHR from the extension to external AI APIs for the LLM step.
- If external AI is considered later, it should be a deliberate product/security decision and documented here.

---

*Add other project notes below as needed.*
