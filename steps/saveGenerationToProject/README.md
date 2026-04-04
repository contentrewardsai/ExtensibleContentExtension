# Save generation to project

Queued items are written under **`uploads/{projectId}/{folder}/`** (default folder `generations`) when you click **Save pending generations** in the Library side panel.

## Testing

### Unit tests (step-tests.js)

- resolve literal
- resolve variable ({{variableKey}} template)
- normalizeNamingFormat (numeric, row, empty → numeric)

### E2E (test-config.json)

- Workflow: e2e-test-saveGenerationToProject
- Prereqs: fixture, projectFolder
- Uses stored project folder when set; skipped when not
