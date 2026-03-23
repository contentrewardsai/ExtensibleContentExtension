# Run workflow

Runs another workflow as a **sub-workflow**. The child workflow receives the current row; you can map parent row keys to child row keys via **Row mapping**. Useful for reusing a sequence of steps (e.g. "generate then send") or breaking a large workflow into smaller ones. The player executes the Run workflow step inline (not via a step handler); the selected workflow is resolved at playback from the workflow list.

## Configuration

| Field | Description |
|-------|-------------|
| **Run only if** | Optional. Row variable or `{{var}}` expression; when empty or falsy, this step is skipped. |
| **Workflow** | The **child workflow** to run (dropdown of existing workflows). Must exist at playback time. |
| **Row mapping (parent key → child key)** | JSON object mapping **current row** keys to the keys the child workflow expects. Example: `{"url": "pageUrl", "prompt": "title"}` so the child receives `url` and `prompt` from the parent row’s `pageUrl` and `title`. Omit or use `{}` to pass the row as-is. |

## Behavior

- The player loads the child workflow by ID and runs its actions with the **current row** (after applying row mapping). The child’s steps see the mapped row; variable substitution (e.g. `{{url}}`) uses the mapped keys.
- If **Run only if** is set, the step is skipped when the resolved value is empty or falsy; the workflow continues with the next step.
- Run workflow is often used **inside a Loop** (e.g. Loop over list → Run workflow per item) so each iteration runs the same sub-workflow with a different row or with `{{item}}` mapped in.

## Testing

### Unit tests (step-tests.js)

- **defaultAction type**: step type contract

### E2E (e2e.json)

- Workflow: e2e-test-runWorkflow (runs nested e2e-test-click); asserts fixture shows "Primary button clicked"
