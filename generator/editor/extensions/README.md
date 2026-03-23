# Editor extensions

Editor extensions are scripts that **extend the unified editor** (Fabric canvas, timeline, book mode). They add toolbar buttons, export handlers, and optional sidebar sections. Templates declare which extensions to load via `extension.json`:

```json
{
  "id": "tts-audio",
  "editorExtensions": ["tts"],
  ...
}
```

## Extension scripts

The **loader** lives under **`generator/editor/extensions/`** (`loader.js`, `api.js`); **plugin scripts** live only under **`generator/extensions/<id>.js`** (do not duplicate plugins under `editor/extensions/`).

Extensions live in **`generator/extensions/<id>.js`**. Each script is loaded when the editor opens and receives the **editor API**. The script must expose a function on `window.__CFS_editorExtension_<id>` (with `-` in the id) or `__CFS_editorExtension_<id_with_underscores>`.

Examples: `generator/extensions/tts.js` (Speak button + audio export), `generator/extensions/stt.js` (Start/Stop listening, writes transcript), `generator/extensions/combine-videos.js` (Video list button: add/remove/reorder URLs; add `editorExtensions: ["combine-videos"]` to a template's extension.json).

```js
(function (global) {
  function register(api) {
    api.registerToolbarButton('tts-speak', 'Speak', function (ctx) {
      var position = ctx.position;   // current playhead time (seconds)
      var selected = ctx.selectedClip; // selected canvas object or null
      var values = api.getValues();
      // ... speak using Web Speech API
    });
    api.events.on('clip:selected', function (data) {
      // data.object, data.selected
    });
    var unsub = api.events.on('mergefield:changed', function (data) {
      // data.fields – array of updated merge field keys
    });
    // unsub() to unsubscribe
    api.registerExportHandler('audio', function (values) {
      return Promise.resolve({ type: 'audio', data: urlOrText });
    });
  }
  global.__CFS_editorExtension_tts = register;
})(typeof window !== 'undefined' ? window : globalThis);
```

## Editor API

The API object is created by `editor/extensions/api.js` and passed to each extension.

| Method | Description |
|--------|-------------|
| `registerToolbarButton(id, label, onClick)` | Add a button. `onClick` is called with one argument: `{ position, selectedClip }` (playhead time in seconds, and the selected canvas object or null). |
| `registerExportHandler(outputType, handler)` | `outputType`: `'image'` \| `'audio'` \| `'video'` \| `'text'` \| `'book'`. `handler(values)` returns `Promise<{ type, data }>`. When the user exports that type, the first registered handler is called. |
| `registerSidebarSection(renderFn)` | Add a section to the editor sidebar (future use). `renderFn(containerEl)` is called when the editor mounts. |
| `getCanvas()` | Current Fabric.js canvas (or null). |
| `getTemplate()` | Current template.json object. |
| `getExtension()` | Current extension.json object. |
| `getValues()` | Current merge/sidebar values (from the generator sidebar). |
| `setValue(id, value)` | Update a sidebar value by input id. |
| `refreshPreview()` | Trigger a preview refresh (e.g. after setting values). |
| `getPlaybackTime()` | Current timeline playhead time in seconds. |
| `isPlaying()` | Whether timeline playback is active. |
| `getSelectedObject()` | Currently selected canvas object or null. |
| `getTotalDuration()` | Total timeline duration in seconds. |
| `getClips()` | Array of clip descriptors (start, length, trackIndex, etc.). |
| `getEdit()` | Current edit as ShotStack-style template object. |
| `events` | Event bus: `events.on(name, fn)` returns an unsubscribe function. See events below. |

### Events

Subscribe with `api.events.on('eventName', fn)`. Returns a function; call it to unsubscribe.

| Event | Payload |
|-------|---------|
| `clip:selected` | `{ object, selected }` – selected canvas object and selection array |
| `selection:cleared` | `{}` |
| `clip:updated` | `{}` – after object/clip modified |
| `playback:play` | `{}` |
| `playback:pause` | `{}` |
| `edit:undo` | `{}` |
| `edit:redo` | `{}` |
| `duration:changed` | `{ duration }` |
| `timeline:updated` | `{ clips, duration }` |
| `mergefield:changed` | `{ fields }` – array of merge field keys that were applied |
| `output:resized` | `{ width, height }` – canvas/output size changed |
| `timeline:resized` | `{ height }` – timeline panel height after user resize |

## When to use extensions vs legacy plugins

- **Editor extensions** – Add UI or behavior **inside the unified editor**: extra buttons, custom export (e.g. TTS for audio), new tools. They do not replace the editor.
- All generation is template-engine + shared modules. Use editor extensions for editor-specific UI (e.g. Video list, TTS, STT).

## Loading order

1. User selects a template → unified editor is created.
2. Editor creates the API and sets refs (getCanvas, getTemplate, getValues, etc.).
3. Editor calls the loader with `extension.editorExtensions` (e.g. `["tts"]`).
4. Loader fetches and runs each `generator/extensions/<id>.js` and passes the API.
5. Extensions call `api.registerToolbarButton`, `api.registerExportHandler`, etc.
6. Editor adds extension toolbar buttons and uses registered export handlers when the user exports.
