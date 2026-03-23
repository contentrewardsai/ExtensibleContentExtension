# Send to endpoint

Sends an HTTP request to a configurable URL. The endpoint URL and request body can use **row variables** (so each run can send to a different URL and with different data). Supports **variable substitution** with `{{variableName}}` in the URL, body, and headers so values from the current row—including outputs from earlier steps—are filled in at runtime.

## Configuration

| Field | Description |
|-------|-------------|
| **Run only if** | Optional. Skip this step when the given variable or `{{var}}` expression is empty/falsy. |
| **Endpoint URL** | Literal URL (e.g. `https://api.example.com/webhook`) or leave empty to use the row variable below. You can use `{{var}}` in the URL. |
| **Row variable for URL** | When URL is empty, the URL is taken from this row key (e.g. `endpointUrl`, `apiUrl`). Each row can have a different endpoint. |
| **Method** | GET, HEAD, POST, PUT, PATCH, or DELETE. |
| **Body source** | **Template**: body is the literal “Body template” with `{{var}}` substituted. **Row variable**: body is the value of the given row variable (e.g. `payload`), with `{{var}}` inside that value substituted. |
| **Body template** | Used when Body source is Template. JSON or text with `{{name}}`, `{{id}}`, etc. Shown only when Body source is Template. |
| **Row variable for body** | Used when Body source is Row variable. Column name whose value is sent as the request body. Shown only when Body source is Row variable. |
| **Body Content-Type** | When you don’t set Content-Type in Headers: **application/json** (default), **application/x-www-form-urlencoded**, or **text/plain**. |
| **Headers** | Optional. One `Key: Value` per line or JSON. Use `{{token}}` etc. for row values. If you set Content-Type here, it overrides Body Content-Type. |
| **Accept as success** | **2xx only** (default): only 2xx status is success. **2xx and 3xx**: 2xx and 3xx (e.g. redirects) are treated as success. |
| **Wait for response** | If checked, the step waits for the HTTP response and can save it (see below). |
| **Save response to variable** | Row variable name to store the response (full body or the value at Response path). |
| **Save status code to variable** | Optional. Row variable to store the HTTP status code (e.g. `200`, `201`). |
| **Save response headers to variable** | Optional. Row variable to store the response headers as a JSON string. |
| **Response path** | Optional. Dot notation (e.g. `data.id`, `items.0.name`) to save only that nested value from a JSON response. |
| **Timeout (ms)** | Optional. Abort the request after this many milliseconds. Leave empty for no timeout. |
| **Retry count** | Number of retries on failure (0 = no retry). Each attempt uses the same URL, body, and headers. |
| **Retry delay (ms)** | Delay in milliseconds between retries (min 100). |

## Variable substitution

- **URL**: `https://api.example.com/users/{{userId}}` — `userId` comes from the current row.
- **Body template**: `{"name": "{{name}}", "email": "{{email}}"}` — `name` and `email` from the row.
- **Headers**: `Authorization: Bearer {{accessToken}}` — token from the row.
- **Row variable for body**: If the row has a column `payload` whose value is `{"id": "{{id}}"}` or raw JSON, that value is used as the body and `{{id}}` is replaced with the row’s `id`.

Values can come from earlier steps in the same run (e.g. an “Extract data” or “Run generator” step that writes to a variable). **Video from timeline:** Run generator step and bulk create both support video templates (PixiJS timeline player → WebM). The generator runner loads Pixi so workflow runs can produce video output; a Send to endpoint step can receive video URLs from a previous Run generator step. **Body from row variable** can be a data URL (e.g. from **Screen capture** saveAsVariable) or a blob/HTTP URL; set Content-Type appropriately for binary uploads.

## Authentication

**Bearer tokens, API keys, and Basic auth are supported** via the **Headers** field. Use `{{variableName}}` so the secret comes from the row (e.g. from a previous step or your data), not from the workflow config.

| Auth type | Example in Headers |
|-----------|--------------------|
| **Bearer token** | `Authorization: Bearer {{accessToken}}` |
| **API key** (header) | `X-API-Key: {{apiKey}}` or `Authorization: ApiKey {{apiKey}}` |
| **Basic auth** | `Authorization: Basic {{base64Credentials}}` (row holds base64 of `user:password`) |
| **Custom** | Any `Key: Value` line; values can use `{{var}}`. |

- Add a column to your row data (e.g. `accessToken`, `apiKey`) or set it in an earlier step, then reference it in Headers as `{{accessToken}}`, `{{apiKey}}`, etc.
- Avoid putting secrets literally in the step; use variables so they stay in row data and can differ per run.

**Note:** The request runs in the extension background, so browser session cookies are not sent. Use header-based auth (Bearer, API key, Basic) with variables for tokens or keys.

## Testing

### Unit tests (step-tests.js)

- **parseHeadersJson**: JSON object, key-value lines, empty, invalid JSON
- **isSuccess**: 2xx, 2xx-3xx status handling

### E2E (e2e.json)

- Workflow: e2e-test-send-endpoint on fixture; asserts echo server receives body.

## Response handling

- If **Wait for response** is checked and **Save response to variable** is set, the response body is stored in that row variable.
- If **Response path** is set (e.g. `data.id`), the step parses the response as JSON and saves only that path; otherwise the full response (parsed as JSON when possible, else raw text) is saved.
- **Save status code to variable** and **Save response headers to variable** are written whenever the request is considered successful (according to **Accept as success**), even if you don’t save the body.

## Retries

- When **Retry count** is greater than 0, the step retries the request on any failure (non-success status, timeout, or network error).
- After each failure it waits **Retry delay (ms)** before the next attempt. After the last attempt it throws with the last error.

## Errors and CORS

- Responses that are not accepted as success (see **Accept as success**) cause the step to fail; the error message includes status and a short body snippet when available.
- The request is made from the extension’s background context. Cross-origin endpoints must allow the request (CORS or same-origin). If you see CORS errors, the server or a proxy must allow the extension’s origin.
