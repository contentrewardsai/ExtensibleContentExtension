# Call LLM (`llm`)

Runs a prompt with optional **`{{rowVariable}}`** substitution and saves the result to a row variable.

## Backends

1. **Default (Settings):** **Extension Settings → Local Keys → LLM providers → Workflow — Call LLM default** (`lamini`, `openai`, `claude`, `gemini`, or `grok`). API keys for cloud providers are stored in `chrome.storage.local` (see **docs/PROGRAMMATIC_API.md**). Use **Test** next to each key to confirm credentials (or **`CFS_LLM_TEST_PROVIDER`** from code).
2. **Per step:** In the side panel step editor, **Backend (optional)** overrides Settings for that step only. Optional **Model** maps to OpenAI model id or Claude/Gemini/Grok override.

Execution goes through the **service worker** (`CALL_LLM` → local QC sandbox for LaMini, or `background/remote-llm.js` for cloud). Requests time out after **120 seconds**. Trimmed prompts longer than **500,000** characters are rejected without calling a model. Cloud API keys are capped at **4096** characters (Settings and **`CFS_LLM_TEST_PROVIDER`**). Model ids and overrides are capped at **256** characters.

For **OpenAI** and **Grok** (OpenAI-compatible chat completions), model ids matching **`o` + digit** (e.g. o3, o4) or starting with **`gpt-5`** use **`max_completion_tokens`** and omit a custom **`temperature`**, matching vendor rules for reasoning-style models (same behavior as o1).

## Response types

- **True / False** — model must reply with `true` or `false`.
- **Text** — plain string stored in **`saveAsVariable`**.
- **Text with feedback** — JSON `{"response":"...","feedback":"..."}`; both can be saved to separate variables.

## Local LaMini

When the effective backend is **LaMini**, the Xenova model must be present under the user’s **project folder** (`models/Xenova/...`) or installed via `scripts/download-lamini-model.sh`.

## Testing

See **step-tests.js** (prompt interpolation, empty prompt, response types).
