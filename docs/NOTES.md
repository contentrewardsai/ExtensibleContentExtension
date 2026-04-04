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

## Chrome Web Store / privacy copy (release checklist)

When changing **`manifest.json`** permissions or **`host_permissions`**, update the root **README.md** section **Privacy and permissions** so store listings and user-facing privacy text stay aligned. For new third-party HTTPS origins (crypto, LLMs, integrations), follow **docs/HOST_PERMISSIONS_CRYPTO.md** and extend **`scripts/verify-crypto-manifest-hosts.cjs`** when required.

---

## npm audit and dependency overrides

Target: **`npm audit`** clean at **`--audit-level=moderate`** after **`npm ci`**. CI runs **`npm audit`** in **Extension checks** and fails if new advisories appear.

**`package.json` `overrides`** (keep in sync when bumping chain SDKs or if **`npm audit`** regresses):

- **`bn.js`**: **`^5.2.3`** — nested **`@pancakeswap/swap-sdk-core`** must not pull vulnerable **bn.js** 5.0.0–5.2.2 ([GHSA-378v-28hj-76wf](https://github.com/advisories/GHSA-378v-28hj-76wf)).
- **`bigint-buffer`**: **`npm:bigint-buffer-fixed@1.1.6`** — replaces unmaintained **`bigint-buffer@1.1.5`** ([GHSA-3gc7-fjrx-p6mg](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg)). The fixed package lists **node-gyp**; the following overrides pin patched transitive versions so **`npm audit`** stays clean: **`node-gyp`**, **`tar`**, **`cacache`**, **`make-fetch-happen`**, **`http-proxy-agent`**, **`@tootallnate/once`**.
- **`path-to-regexp`**: Keep **`express@4`**’s dependency at **`^0.1.13`** or newer ([GHSA-37ch-88jc-xwx2](https://github.com/advisories/GHSA-37ch-88jc-xwx2)); **`npm audit fix`** may refresh this under **`@meteora-ag/dlmm`**.

After changing overrides or dependencies, run **`npm run build:chain-bundles`** and commit updated **`background/*.bundle.js`** files.

---

## Optional external LLM APIs (user opt-in)

Users may store **their own** API keys in `chrome.storage.local` (Settings → Local Keys → LLM providers) and choose a **workflow** default and a separate **Local AI Chat** default: local **LaMini** (default) or cloud (**OpenAI**, **Claude / Anthropic**, **Gemini**, **Grok / xAI**).

- **Outbound calls** happen only from the **service worker** (`background/service-worker.js`) when the chosen provider is cloud and the matching key is set. Implementation: `background/remote-llm.js` (loaded via `importScripts`). The **Call LLM** step can override backend/model per step (`llmProvider`, `llmOpenaiModel`, `llmModelOverride` on the action, or optional fields on the `CALL_LLM` message). OpenAI-compatible **`callOpenAiCompatible`** uses **`max_completion_tokens`** and skips **`temperature`** when the model id matches **`o` + digit** or **`gpt-5`** prefix (reasoning-style chat completions).
- **Chat:** `CALL_REMOTE_LLM_CHAT` passes messages through `cfsSanitizeLlmChatMessages` (role + string content only) before calling vendors.
- **Timeouts:** Cloud `fetch` calls in `remote-llm.js` use **`cfsLlmFetch`** (default **120s** per request, `AbortController`).
- **Limits:** `CALL_LLM` prompt (trimmed) **≤ 500k** chars; `CALL_REMOTE_LLM_CHAT` **≤ 128** messages and **≤ 400k** chars total content (see `cfsValidateRemoteChatInput` in `service-worker.js`). Cloud **model ids** (OpenAI selection / Claude·Gemini·Grok overrides) are capped at **256** characters in **`remote-llm.js`** and Settings save/UI.
- **API keys:** Stored keys and inline **`CFS_LLM_TEST_PROVIDER`** `token` values are limited to **4096** characters (Settings save, **`CALL_LLM`**, **`CALL_REMOTE_LLM_CHAT`**, and test-provider paths reject longer values without calling vendors).
- **Key check:** Settings **Test** buttons and **`CFS_LLM_TEST_PROVIDER`** call `CFS_remoteLlm.pingProvider` (minimal completion; same quotas as normal use).
- **Empty 200 responses:** `callGemini` maps blocked or empty candidates to **`ok: false`**. **`callOpenAiCompatible`** (OpenAI + Grok) and **`callClaude`** return **`ok: false`** when the HTTP body has no extractable assistant text, matching **`callRemoteChat`** and avoiding a misleading **Test** success on empty completions.
- **Do not** commit keys, prompts, or vendor responses to the repo. Do not add server-side proxying in this codebase unless product explicitly requires it.
- **LaMini** remains the default and still runs in the QC sandbox (`sandbox/quality-check.js`); weights live under the user’s project folder `models/Xenova/` or via `scripts/download-lamini-model.sh`.
- **qualityCheck** / embedding-only QC paths are still local unless separately updated.

---

*Add other project notes below as needed.*
