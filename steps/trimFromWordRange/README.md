# Trim from word range

Trim a video to a **word-level time range** using a word list (from `transcribeAudio`). Reads the word timestamps from a row variable, picks the start/end word indices, and creates a trimmed video segment. Used for precise clip extraction based on spoken content.

## Configuration

| Field | Description |
|-------|-------------|
| **videoVariableKey** | Row variable containing the source video. |
| **wordsVariableKey** | Row variable containing the word list (JSON array with `start`/`end` times). |
| **startWordIndex** | Index of the first word (inclusive). |
| **endWordIndex** | Index of the last word (inclusive). |
| **paddingMs** | Optional padding before/after (ms). |
| **saveAsVariable** | Row variable for the trimmed video. |

## Testing

**steps/trimFromWordRange/step-tests.js** — word index/time extraction, empty list handling. `npm run build:step-tests && npm run test:unit`
