# Whisper check

Compare transcript to expected text via embedding similarity in the QC sandbox. Fails the row if similarity is below the threshold.

## Testing

### Unit tests (step-tests.js)

- **getTranscriptVar**: default
- **getExpectedVar**: default
- **getThreshold**: default (0.75), custom

### E2E (test-config.json)

- Workflow: e2e-test-whisperCheck
- Rows: `transcript`, `expectedText` (e.g. "hello world" both)
- Prereqs: qc (QC sandbox + embedding model)
- Runs in CI: yes. The E2E profile (`test/.e2e-user-data`) is cached so embedding model downloads once.
