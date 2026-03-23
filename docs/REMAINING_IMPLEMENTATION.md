# Implementation status

Summary of what is done and what remains.

---

## Done

The following are implemented and in use:

- Scheduled run execution (alarms, Activity → Upcoming)
- Screen capture step (full recording, Proceed when)
- Run workflow / Loop as step plugins
- Programmatic row feed (SET_IMPORTED_ROWS, RUN_WORKFLOW)
- Hover with visibility-only changes
- Schema-driven step UI (formSchema → generic form renderer)
- Step conditions (runIf) and loops (listVariable, count)
- Loop-over-list in row (itemVariable, indexVariable)
- Walkthrough backend progress reporting (reportUrl)
- Book export with per-step screenshot placeholders in HTML/Markdown output
- Bulk video / Run generator video (Pixi timeline)
- Generator handler migration (all templates unified)
- Book export, workflow-step-images, combine-videos, video tutorial, tutorial export, walkthrough embed

---

## Remaining

| Area | Status | Notes |
|------|--------|-------|
| **Workflow Q&A + credits** | Partial | Q&A UI with local storage, credits balance, backend API doc. Backend sync and payouts still to come. See docs/BACKEND.md (§ Workflow Q&A and credits API). |

---

## References

- **docs/PROJECT_STRUCTURE.md** (§ Documentation) – full doc index
- **docs/AUDIT_REPORT.md** – audit and hardening
- **docs/WORKFLOW_SPEC.md** (§ Workflow format and plugin structure) – workflow format reference
