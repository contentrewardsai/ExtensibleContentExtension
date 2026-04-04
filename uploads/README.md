# Uploads

This folder is used by the **Uploads** feature in the extension (Library tab → Uploads).

- **When you use the extension:** Open the side panel → **Library** → set **Set project folder** to a directory (e.g. this repo or another folder). Then under **Uploads**, choose a project (e.g. `default` or a cloud project). The extension uses `uploads/{projectId}/` inside that project folder.
- **Structure:** One subfolder per project (e.g. `uploads/default/`, `uploads/my-project-id/`). You can create more subfolders and copy files in (upload) or out (download) from the Library → Uploads UI.
- **If this repo is your project folder:** This `uploads/` directory is the one that will be used. Add project subfolders and files here, or create them from the UI.

---

## Posts (Upload-Post)

Under each project you can add a **posts** folder for content intended for **Upload-Post** (Pulse → **Connected** accounts). Layout:

```
uploads/{projectId}/
└── posts/
    ├── pending/              ← drafts before a Connected account is chosen
    │   └── {post_id}/
    │       └── post.json
    └── {account_handle}/     ← one per Connected profile (e.g. blaketoves)
        └── {post_id}/       ← one folder per post
            ├── post.json   ← manifest: payload, status, post URL(s)
            ├── video.mp4   ← (optional) video
            ├── image1.jpg  ← (optional) images
            ├── caption.txt ← (optional) text
            └── ...
```

The extension may still **read** older posts at **`{projectRoot}/posts/…`** (legacy). New workflow saves use **`uploads/{projectId}/posts/…`**. To move legacy trees into the canonical layout, use **Migrate root posts → uploads** in the Library tab (target project = the uploads project you have open in Library → Uploads, or **`default`** if none).

When a workflow saves a post manifest from a tab, the service worker may **open the side panel** automatically if it was closed (so the panel can handle the save). You still need a **project folder** set in Library.

- **post.json** holds: the data needed to submit to the Upload-Post API (user, platform[], title, description, media references), **status** (e.g. `draft`, `in_review`, `scheduled`, `posted`, `failed`), and after posting the **URL(s)** to the post per platform (in `results`).
- **Media** (images, video, caption text) live in the same post folder and are referenced by filename in `post.json`. Upload-Post accepts **both direct file uploads (multipart)** and **media URLs**; you can send the files from this folder directly or use hosted URLs if you have them.

Full schema, status values, and API mapping: **docs/UPLOAD_POST_POSTS_SPEC.md**.

---

## Generator: download to uploads

When the generator loads a template (or you use **Import JSON**), remote media URLs can be resolved to local or blob URLs so the editor and Pixi player avoid CORS when drawing. The generator uses two optional globals:

| Global | Purpose |
|--------|---------|
| **`window.__CFS_downloadToUploads`** | `function(url) → Promise<string>`. Called for each remote media URL (video, image, SVG, audio). Return a local URL or blob URL; the editor uses it instead of the original URL. If you don’t set this, the generator sets a default that `fetch`es the URL and then either calls `__CFS_saveToUploads` or returns a blob URL. |
| **`window.__CFS_saveToUploads`** | `function(blob, filename) → Promise<string>`. If set, the default `__CFS_downloadToUploads` uses it: after fetching the URL it saves the blob (e.g. into your uploads folder) and returns the resulting local URL. If not set, the default returns a blob URL only (no persistent save). |

So: **no `__CFS_saveToUploads`** → media is fetched and a blob URL is used (avoids CORS; blob is in memory). **With `__CFS_saveToUploads`** → the host app can write the blob to disk (e.g. `uploads/{projectId}/`) and return a file URL. Reload Extension does not auto-discover these; they are set by the host or by your own script before the generator runs.

---

## Generations (workflow queue)

When a workflow uses **Save generation to project**, outputs are queued until you click **Save pending generations** in the Library panel. Files are written to **`uploads/{projectId}/{folder}/`** (default folder name `generations`), not under `Library/…`. Queued items may be **data URLs** (typical image/video from a step), **`blob:` URLs** (same tab / extension context), or **https URLs** (e.g. **ShotStack** / **renderShotstack**); remote URLs are fetched via the service worker before writing. Items that fail or are unsupported **stay in the queue** so you can fix the issue and click **Save pending generations** again; successfully saved items are removed. The target **`projectId`** for each item is: the id from the step/row if set, else the **Uploads** project you are browsing, else the saved **default project** in Settings, else **`default`**. Clicking a project under Library → Uploads also updates that default.

If you still have files under **`Library/{projectId}/generations/`** from an older extension version, use **Migrate old Library generations** in the Library tab. That copies each file into **`uploads/{projectId}/generations/`** and **skips** any filename that already exists there.
