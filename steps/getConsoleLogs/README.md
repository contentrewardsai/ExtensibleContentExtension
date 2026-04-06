# Get console logs

Capture browser console output (`console.log`, `console.warn`, `console.error`, `console.info`, `console.debug`) and save captured entries to a row variable.

## How it works

1. On first run, the step patches `console.log/warn/error/info/debug` to also push entries into an in-memory buffer (`window.__CFS_consoleLogs`). The original console methods are preserved and still output normally.
2. When the step executes, it reads the buffer, applies level and count filters, saves the result to the specified row variable, and optionally clears the buffer.

Each entry in the saved array has the shape:

```json
{ "level": "log", "message": "Hello world", "timestamp": 1712345678901 }
```

## Configuration

| Field | Default | Description |
|-------|---------|-------------|
| `saveAsVariable` | `consoleLogs` | Row variable key to save entries to |
| `levels` | `log,warn,error` | Comma-separated console levels to include |
| `maxEntries` | `100` | Maximum number of entries to return (most recent kept) |
| `clear` | `true` | Clear the buffer after reading |

## Usage tips

- Place a **Wait** or **delay** step before this step to give the page time to produce console output.
- Use `clear: false` to accumulate logs across multiple reads in a workflow.
- To capture all levels, set `levels` to `log,warn,error,info,debug`.

## Testing

### Unit tests (step-tests.js)

- Handler meta: `needsElement: false`
- Throws without context
- Throws without saveAsVariable
- Level filtering (log only, error+warn)
- Max entries limits from end
- Handler saves to currentRow and clears buffer
- Handler preserves buffer when `clear: false`
- getSummary with custom variable
- getSummary defaults
