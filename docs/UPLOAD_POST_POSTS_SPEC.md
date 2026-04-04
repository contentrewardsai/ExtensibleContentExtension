# Upload-Post posts folder spec (v2)

This spec defines how the extension stores **post manifests** (`post.json`) and optional media for [Upload-Post](https://docs.upload-post.com/llm.txt).

**Canonical layout (current):** under the user’s **project folder**,

`uploads/{projectId}/posts/…`

**Legacy layout (still read by Library):** top-level

`{projectRoot}/posts/{account_handle}/{post_id}/`

New writes from the workflow **`uploadPost`** step and generator flows use the **canonical** path when a **project id** is resolved (row `projectId` / `_cfsProjectId` from **`loadProjectFile`**, Library uploads context, or step **`defaultProjectId`**). See **`cfs_project_id`** and **`cfs_placement`** on the manifest (§2.1).

---

## 1. Folder structure

### 1.1 Canonical: `uploads/{projectId}/posts/`

```
{projectRoot}/
└── uploads/
    └── {projectId}/
        └── posts/
            ├── pending/
            │   └── {post_id}/       # drafts before an account is known
            │       ├── post.json
            │       └── …
            └── {account_handle}/    # slug from Connected profile username
                └── {post_id}/
                    ├── post.json
                    ├── video.mp4      # (optional)
                    ├── image1.jpg
                    └── …
```

- **pending/** – Drafts (e.g. generator saves) where **`account_handle`** is not yet known.
- **{account_handle}/** – One folder per **Connected** profile (safe slug). ShotStack renders may use `shotstack`.
- **{post_id}/** – Typically `post_YYYY-MM-DDTHH-MM-SS` (ISO-style, filesystem-safe).

### 1.2 Legacy: `{projectRoot}/posts/`

```
{projectRoot}/
└── posts/
    └── {account_handle}/
        └── {post_id}/
            ├── post.json
            ├── video.mp4
            └── …
```

The Library **Posts** view **merges** legacy `posts/` trees with **`uploads/*/posts/`** so older projects keep appearing. Use **Library → Migrate root posts → uploads** to copy **`{projectRoot}/posts/{account}/{post_id}/`** into **`uploads/{projectId}/posts/…`** (project id = current Uploads project selection, or **`default`**). Existing destination **`post.json`** causes that post folder to be skipped; copied manifests get **`cfs_project_id`** / **`cfs_placement`** when missing.

---

## 2. post.json schema (v2)

Each post folder must contain a **post.json** file. When submitting, the extension maps it to the [Upload-Post OpenAPI](https://docs.upload-post.com/openapi.json) request body.

### 2.1 Core fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| **version** | number | Yes | Schema version (`2`). |
| **user** | string | Yes | Upload-Post profile username. |
| **platform** | string[] | Yes | Platforms to publish to (e.g. `["instagram", "tiktok"]`). |
| **title** | string | Yes | Default title/caption for the post. |
| **description** | string | No | Extended text. |
| **media** | object | No | References to media files (see §2.2). |
| **status** | string | Yes | One of: `draft`, `in_review`, `scheduled`, `posting`, `posted`, `failed`. |
| **scheduled_at** | string | No | ISO 8601 datetime when the post is scheduled. |
| **posted_at** | string | No | ISO 8601 datetime when the post was published. |
| **request_id** | string | No | Returned by Upload-Post for async uploads. |
| **job_id** | string | No | Returned by Upload-Post for scheduled posts. |
| **results** | object | No | Per-platform result after submit (see §2.3). |
| **options** | object | No | Platform-specific fields sent with the upload (see §2.4). |
| **defaults_used** | object | No | Records which defaults were active at post time (see §2.5). |
| **source** | string | No | Origin of this post: `generator`, `workflow`, `shotstack`. |
| **cfs_project_id** | string | No | Resolved uploads project id used for the folder path (`uploads/{id}/posts/…`). |
| **cfs_placement** | string | No | `pending` or `posted` — whether the folder lived under **pending** vs **{account_handle}**. |
| **created_at** | string | No | ISO 8601 when this post was created. |
| **updated_at** | string | No | ISO 8601 when post.json was last updated. |

### 2.2 media

| Field | Type | Description |
|-------|------|-------------|
| **video** | string\|null | Filename or URL of the video. |
| **photos** | string[] | Filenames or URLs of images. |
| **audio** | string\|null | Filename or URL of the audio file. |
| **caption_file** | string\|null | Filename for a text file used as title/caption. |

### 2.3 results (after submission)

| Field | Type | Description |
|-------|------|-------------|
| **results.*platform*** | object | Key = platform id (e.g. `instagram`). |
| **results.*platform*.success** | boolean | Whether the upload succeeded. |
| **results.*platform*.url** | string | Direct URL to the published post. |
| **results.*platform*.post_id** | string | Platform-specific post id. |
| **results.*platform*.error** | string | Error message if failed. |

### 2.4 options

All platform-specific fields sent to the Upload-Post API, using the same key names (e.g. `privacyStatus`, `media_type`, `privacy_level`, `first_comment`, `facebook_page_id`, etc.). This records exactly what was sent, whether from user input or defaults.

### 2.5 defaults_used

Records the default values that were active at the time of posting, for auditing. Where those defaults are configured in the extension (Settings UI, optional **`config/platform-defaults.json`** on disk, and `chrome.storage.local`) is documented in **docs/PLATFORM_DEFAULTS.md**.

| Field | Type | Description |
|-------|------|-------------|
| **source** | string | `global` or `profile` |
| **profile** | string | Profile username if profile-level defaults were used. |
| **platform_defaults** | object | The resolved default values that were applied. |

---

## 3. Status values

| Status | Meaning |
|--------|---------|
| **draft** | Not submitted; may be incomplete. |
| **in_review** | Ready for review. |
| **scheduled** | Submitted with `scheduled_date`; use `job_id` to check. |
| **posting** | Submitted with `async_upload=true`; use `request_id` to poll. |
| **posted** | Successfully published; `results` and `posted_at` set. |
| **failed** | Submit failed; see `results.*.error`. |

---

## 4. Example post.json (v2)

```json
{
  "version": 2,
  "user": "blaketoves",
  "platform": ["instagram", "tiktok"],
  "title": "Check out this clip!",
  "description": "",
  "media": {
    "video": null,
    "photos": ["export.png"],
    "audio": null,
    "caption_file": null
  },
  "status": "posted",
  "scheduled_at": null,
  "posted_at": "2026-03-15T14:30:00Z",
  "request_id": "req_abc123",
  "job_id": null,
  "results": {
    "instagram": { "success": true, "url": "https://www.instagram.com/p/ABC123/", "post_id": "ABC123" },
    "tiktok": { "success": true, "url": "https://www.tiktok.com/@user/video/xyz", "post_id": "xyz" }
  },
  "options": {
    "media_type": "REELS",
    "first_comment": "Link in bio!"
  },
  "defaults_used": {
    "source": "profile",
    "profile": "blaketoves",
    "platform_defaults": { "media_type": "REELS" }
  },
  "source": "generator",
  "created_at": "2026-03-15T14:30:00Z",
  "updated_at": "2026-03-15T14:30:00Z"
}
```

---

## 5. Auto-save behavior

Manifests are written under **`uploads/{projectId}/posts/…`** when:

1. **Generator UI** – After a successful upload or schedule (Upload Post section in the generator), if a generator project id is set.
2. **Workflow `uploadPost` step** – After a successful API response, the service worker sends **`SAVE_POST_TO_FOLDER`** to the **side panel** (must be open; project folder must be granted). Optional step flag **`savePostManifestToDisk`** (default on) disables disk write when unchecked.
3. **ShotStack render** – After a successful cloud render in the ShotStack generator UI.
4. **Workflow `savePostDraftToFolder` step** – Writes **`status: draft`** to **`posts/pending/`** only (no Upload Post API).

The service worker forwards **`SAVE_POST_TO_FOLDER`** with **`chrome.runtime.sendMessage`** so the side panel receives it (not only content scripts). If no response arrives within about **3 seconds**, the worker tries **`chrome.sidePanel.open`** for the tab’s window (or last focused window) so the panel can load its listener—then it keeps waiting for the remainder of the timeout. Workflow disk save failures do **not** fail the API upload; check the browser console for warnings.

Media files (images, video, audio) are saved alongside `post.json` when available from the generator context. For workflow and ShotStack flows that only have URLs, the URL is stored in `media` rather than a local file.

---

## 6. Upload-Post: direct file upload vs URL

Upload-Post supports both direct file uploads (multipart/form-data) and URLs. The post folder supports both: filenames reference local files, URLs are stored as-is.

---

## 7. References

- [Upload-Post OpenAPI spec](https://docs.upload-post.com/openapi.json)
- [Upload-Post API (LLM export)](https://docs.upload-post.com/llm.txt)
- **Pulse / Connected** in the extension: Upload-Post profiles available for posting.
