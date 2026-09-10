# Local AI models

The repo tracks this folder (see `.gitignore`: `models/*` with exceptions for `README.md` and `.gitkeep`). Large weights stay untracked.

**LaMini** is the only in-extension local model: `models/Xenova/LaMini-Flan-T5-783M/` (~820MB). Used by **Send** and **Run** when Local AI Chat is LaMini (default if you are not using a cloud key). Optional CLI: `./scripts/download-lamini-model.sh`.

**Run** and **Send** can also use an API key from Settings (OpenAI, Claude, Gemini, or Grok) with or without a Whop login.
