# Transcribe audio

Transcribe an audio blob (from a row variable, e.g. data URL from a previous step) using Whisper in the QC sandbox. Saves the transcript to a row variable for use by the next step (e.g. whisperCheck).

## Testing

### Unit tests (step-tests.js)

- **getAudioVar**: default, from variableKey, from audioVariable
- **getSaveVar**: default
- **isDataUrl**: data URL, non-data URL, empty

### E2E (test-config.json)

- Workflow: e2e-test-transcribeAudio
- Rows: `capturedAudio: __TINY_AUDIO_URL__` (minimal WAV)
- Prereqs: qc (QC sandbox + Whisper model)
- Runs in CI: yes. The E2E profile (`test/.e2e-user-data`) is cached so Whisper downloads once.
