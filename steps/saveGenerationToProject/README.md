# Save generation to project

## Testing

### Unit tests (step-tests.js)

- resolve literal
- resolve variable ({{variableKey}} template)
- normalizeNamingFormat (numeric, row, empty → numeric)

### E2E (test-config.json)

- Workflow: e2e-test-saveGenerationToProject
- Prereqs: fixture, projectFolder
- Uses stored project folder when set; skipped when not
