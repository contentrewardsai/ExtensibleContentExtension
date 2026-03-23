# Workflow sections, step comments, selector robustness, and output formats

This document describes how **workflow steps and selectors**, **step comments** (text/image/video/audio/URLs), and **generator templates** fit together — and how we support robust fallback selectors, multiple output formats (video tutorial, image series, book, tutorial export, walkthrough embed), and workflow Q&A.

---

## 1. Step comments (describe each step)

Workflow steps should support **comments** that authors use to describe the step. These feed into tutorials, books, video narration, and walkthroughs.

**Comment content (per step):**

- **Text** — Plain or rich text description of what the step does (e.g. "Click the Create video button").
- **Image(s)** — Optional image(s) illustrating the step (screenshot, diagram, or uploaded asset).
- **Video** — Optional short video (e.g. screen recording or webcam of someone doing the step or talking through it).
- **Audio** — Optional audio (voiceover or narration for the step).
- **URL(s)** — Optional link(s) to external resources (docs, help page, related workflow).

**Storage:** Add to the step object in the workflow JSON, e.g.:

```json
{
  "type": "click",
  "selectors": [...],
  "comment": {
    "text": "Click the Create video button to open the Veo 3 panel.",
    "images": [{ "url": "...", "alt": "Create button" }],
    "video": { "url": "..." },
    "audio": { "url": "..." },
    "urls": ["https://support.example.com/veo-create"]
  }
}
```

Or a flatter shape: `stepDescription`, `stepImageUrls`, `stepVideoUrl`, `stepAudioUrl`, `stepResourceUrls`. The exact keys can match what generator templates and tutorial export expect.

**Use:** Generator templates (video tutorial, book, image series, tutorial export, walkthrough embed) read these comments and use them as copy, narration, or tooltips for each step.

---

## 2. Workflow steps and selectors

Workflow steps use **selectors** to find elements (click, type, etc.). The extension supports **multiple selector strategies** per step (ID, data-testid, aria-label, role, text, xpath, cssPath, class, etc.) with **scoring and stability labels**.

### 2.1 Rich selector management

- Each step stores **primary selectors** (`action.selectors`) and **fallback selectors** (`action.fallbackSelectors`).
- The step editor in the sidepanel displays each selector as a card with **type**, **value**, **score**, and **stability label** (Stable, Likely stable, OK, May change).
- Users can **test** individual selectors or all selectors against the current page, **add** selectors manually, **remove** selectors, **reorder** them via drag-and-drop, and **re-generate** selectors from the live page element.
- The player tries selectors in order (primary first, then fallbacks) until one matches.

### 2.2 Selector generation

- `shared/selectors.js` provides `generateSelectors(element)` which produces 17+ selector strategies with scores.
- `generatePrimaryAndFallbackSelectors(element)` splits them into primary (top-scored) and fallback sets.
- `scoreSelectorString(str)` returns a numeric score and stability label for any CSS selector string.
- `resolveElement(selectors, doc)` tries each selector in order and returns the first matched element.

---

## 3. Generator templates under `generator/templates/`

Generator templates (see **generator/templates/README.md** and **schemas/extension-schema.json**) produce outputs (image, video, text, audio, book) from inputs. The following are **template types** or **output formats** that consume **workflow + step comments**.

### 3.1 Video tutorial output format

- **Template:** Template-engine builds a step outline from workflow JSON (no dedicated template folder).
- **Concept:** User picks a **video tutorial template** (e.g. intro + steps + outro, with placeholders for step clips).
- **Inputs:** Workflow (or workflow id), template id, options (resolution, narration style).
- **Per-step insertion:** For each step, we insert:
  - **Text descriptions** — From step comments (text or TTS).
  - **Audio / video** — Optional voiceover or webcam (user’s own recording or uploaded) for that step.
- **Output:** A single video that walks through the workflow step-by-step with example data and narration. Template defines where visuals and narration go (e.g. picture-in-picture, side-by-side).

### 3.2 Series of images (post images)

- **Template:** Template-engine builds manifest or Markdown from workflow JSON (no dedicated template folder).
- **Concept:** Define a **template** (e.g. for a social post) with placeholders: **text** (headline, body from step comment or variable), **image** (screenshot, template graphic, or asset per step), **logo**, **brand text**, etc.
- **Inputs:** Workflow, template, which steps to include, variable values (e.g. brand name, colors).
- **Output:** One image per step (or a series of post images) combining template layout + step text + image + logo/brand. Can be used for carousels, docs, or marketing.

### 3.3 Book format

- **Template:** Book output in the generator (shared/book-builder.js); no dedicated template folder.
- **Concept:** User defines **trim size** (presets or custom width/height), **margins** (inside/gutter, outside, top, bottom — with guidance for min values and gutter by page count), **layout** (screenshot above/below/left/right of text; keep step together on same page), **typography** (font family, size, color), and **headers/footers** (optional text, page numbers). For each step: step title + body text + image placeholder (for a manual or generated screenshot).
- **Output:** Markdown, HTML, **PDF** (print-ready HTML — use browser Print → Save as PDF), or **DOC** (Word-compatible HTML — save file with .doc extension). Generated HTML uses `@page` size and margins for print; min/max page counts per trim size are shown in the template/editor and in output comments.
- **Step images in books:** Book HTML uses placeholder regions for per-step screenshots (layout only). The runner does not rasterize live page DOM into book images.

### 3.4 Tutorial export (JavaScript + tooltips, step-by-step walkthrough)

- **Template:** Walkthrough output in the generator (shared/walkthrough-export.js); no dedicated template folder.
- **Concept:** Export the workflow as **JavaScript code** plus **tooltip/walkthrough metadata**.
- **Output:**
  - **JS code** that can be included on a page to drive a step-by-step walkthrough (e.g. highlight element, show tooltip, "Next" to advance). Uses the same selectors (and fallbacks) as the workflow.
  - **Tooltips / step text** from step comments.
  - Uses **live DOM** to show a "preview" or static version of the page for the tutorial.

### 3.5 Walkthrough embed (interactive learning, quizzing)

- **Template / feature:** Same as Tutorial export; Walkthrough output uses `shared/walkthrough-export.js` (includeQuiz option).
- **Concept:** Generate an **embeddable walkthrough** that can be placed on **another website, page, or app**.
- **Behavior:** User goes through the steps interactively with guidance (tooltips, step comments). **Quizzing:** when `includeQuiz` is set (template option or "Include quiz" on Export as walkthrough), each step with selectors gets a quiz question (step tooltip or "What should you click next?"). The user must click the correct element on the page and click **Verify** before **Next** is enabled; **Skip** advances without verifying.
- **Output:** Embeddable script + config (or iframe). Script built by `shared/walkthrough-export.js` (`buildWalkthroughConfig` with `includeQuiz`, `buildWalkthroughRunnerScript`). **Progress reporting:** set `config.reportUrl` (and optionally `config.reportEvents`) in the exported config; the runner POSTs JSON on `step_viewed`, `step_completed`, `walkthrough_completed`, `walkthrough_closed`. The host page can also listen for the `cfs-walkthrough-progress` CustomEvent. The walkthrough runs against the **live site** with the same selectors.

---

## 4. Workflow Q&A and community (questions, answers as workflows, credits)

- **Questions:** Add to workflows (or to a separate "Questions" area) the ability for a user to **ask a question**, e.g. "How can I create a video on Veo 3?" or "How do I export in 4K?"
- **Answers as workflows:** Other users can **submit workflows as answers**. The system stores the link between question and workflow(s). Over time we can show "Answered by: [workflow name]" and let the asker (or others) run the workflow.
- **Credits (partial):** Users who submit workflows as answers earn credits (local storage). Backend sync and payouts are pending. Users who want to use someone else’s workflow (or unlock premium answers) can **pay in credits**. This is a product/backend feature; the data model needs:
  - Question (id, author, text, domain/topic, created_at).
  - Answer (id, question_id, workflow_id, author, created_at, optional rating).
  - User credits (balance, history of earn/spend).

This section is a **product vision**; implementation can start with "question + list of workflow answers" in the DB and UI, and add credits later.

---

## 5. Summary table

| Area | What we add | Where it lives |
|------|-------------|----------------|
| **Step comments** | text, images, video, audio, URLs per step | Workflow JSON (step object); used by generator templates and tutorial export. |
| **Selector robustness** | Multiple selector strategies; stability scoring; test on live page; fallback chain | shared/selectors.js, analyzer, player. |
| **Video tutorial** | Template + step text/outline; step outline from workflow | generator/templates/, template-engine. |
| **Post image series** | Template (text + page image + logo + brand) → one image per step | generator/templates/ (e.g. ad-apple-notes, ad-facebook). |
| **Book format** | Page format + step text + screenshot placeholders → HTML | generator/templates/, shared/book-builder.js. |
| **Tutorial export** | JS code + tooltips + step-by-step walkthrough from workflow | shared/walkthrough-export.js, template-engine. |
| **Walkthrough embed** | Embeddable interactive walkthrough; optional quizzing | generator/templates/, shared/walkthrough-export.js. |
| **Workflow Q&A** | Ask question; submit workflows as answers; credits (partial – local storage; backend sync pending) | Backend + sidepanel/UI; docs/BACKEND.md (§ Workflow Q&A and credits API). |

---

## 6. References

- **Workflows and steps:** WORKFLOW_SPEC.md, STEPS_AND_RUNTIMES.md.
- **Generator templates:** generator/templates/README.md, generator/templates/schemas/extension-schema.json.
- **Selectors:** shared/selectors.js.
- **Error correction (don’t break):** ERROR_CORRECTION_CHECKLIST.md — checklist for player, step handlers, and sidepanel so scroll-to-step on failure keeps working.
