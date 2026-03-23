# Tutorial loader – JSON-driven step-by-step walkthrough

Tutorial and walkthrough exports produce a **config JSON** and optionally a **runner script** that can be embedded in any page to run a step-by-step walkthrough (highlight element, tooltip, Next/Prev).

## Config format

Same shape as `buildWalkthroughConfig(workflow)` output from `shared/walkthrough-export.js`:

```json
{
  "name": "My workflow",
  "workflowId": "optional-id",
  "steps": [
    {
      "index": 1,
      "type": "click",
      "selectors": ["button.primary", "#submit"],
      "tooltip": "Click the Submit button.",
      "optional": false
    }
  ],
  "reportUrl": "optional URL to POST progress",
  "reportEvents": ["step_viewed", "step_completed", "walkthrough_completed"]
}
```

- **steps[].selectors** – CSS selector(s); first match is highlighted.
- **steps[].tooltip** – Instruction text shown in the tooltip.
- **steps[].quizQuestion** – If set (and selectors exist), "Verify" is required before Next.

## How to use

### 1. Inlined script (current)

- Workflow-based tutorial and walkthrough (Walkthrough output in the generator) use `buildWalkthroughRunnerScript(config)` from `shared/walkthrough-export.js` to produce a single script string with config inlined.
- Host page: paste that script (or set `window.__CFS_WALKTHROUGH_CONFIG` and paste the script without inlined config), then call `__CFS_walkthrough.start()`.

### 2. Loader + JSON (standardized)

- **Implemented:** `shared/tutorial-loader.js`. Include it in any page, then:
  - `__CFS_tutorialLoader.start(config)` – run with a config object; returns `{ next, prev, destroy }`.
  - `__CFS_tutorialLoader.load('/path/to/config.json')` – fetch JSON and start; returns a Promise that resolves to the same instance.
- Config format: same as above. Same UI as the inlined runner (overlay, tooltip, Prev/Next bar, optional quiz).

### 3. Unified editor

- **Tutorial export** and **walkthrough embed** templates use the unified editor to style instructions (panel, Next button, theme). Export produces the runner script (and optionally config JSON). When the standalone loader exists, export can offer "Config only" (JSON) so the host app uses its own copy of `tutorial-loader.js`.

## References

- `shared/walkthrough-export.js` – `buildWalkthroughConfig(workflow)`, `buildWalkthroughRunnerScript(config)`
