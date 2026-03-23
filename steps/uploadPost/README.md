# Upload to Upload Post

Uploads content (video, photo, or text) to social platforms (TikTok, Instagram, YouTube, Facebook, etc.) via the [Upload Post API](https://docs.upload-post.com). Supports all three Upload Post endpoints:

- **Video** &rarr; `POST /api/upload` ([docs](https://docs.upload-post.com/api/upload-video))
- **Photo** &rarr; `POST /api/upload_photos` ([docs](https://docs.upload-post.com/api/upload-photo))
- **Text** &rarr; `POST /api/upload_text` ([docs](https://docs.upload-post.com/api/upload-text))

Post type can be set explicitly or auto-detected from available row data.

## Post Type Auto-Detection

When **Post type** is set to `auto` (the default), the step inspects the current row:

1. If a **video URL** is present &rarr; `video`
2. Else if **photo URL(s)** are present &rarr; `photo`
3. Else if a **title/text** is present &rarr; `text`
4. Else falls back to `video`

You can override auto-detection by setting the **Post type variable key** or **Default post type** to `video`, `photo`, or `text`.

## Configuration

| Field | Description |
|-------|-------------|
| **Run only if** | Optional. Skip this step when the given variable or `{{var}}` expression is empty/falsy. |
| **Post type variable key** | Row variable for post type (`video`, `photo`, `text`). Leave empty for auto-detection. |
| **Default post type** | `auto` (default), `video`, `photo`, or `text`. |
| **Platform variable key** | Row variable for platform(s), e.g. `platform`. Falls back to **Default platform(s)**. |
| **Default platform(s)** | Comma-separated or single platform when variable empty (e.g. `tiktok`, `tiktok,instagram`). |
| **Video URL variable key** | Row variable for video URL. Also checks `videoUrl`, `video`, `generatedVideo`. Required for video posts. |
| **Photo URL(s) variable key** | Row variable for photo URL(s). Comma-separated, JSON array, or single URL. Also checks `photoUrls`, `photoUrl`, `photos`, `imageUrl`, `imageUrls`. Required for photo posts. |
| **Title variable key** | Row variable for title/caption. Required for text posts and YouTube/Reddit videos. Falls back to **Default title**. |
| **Default title** | Used when title variable is empty. |
| **Description variable key** | Row variable for description (used on LinkedIn, Facebook, YouTube, Pinterest, Reddit). |
| **Link URL variable key** | Row variable for link preview URL (text posts on LinkedIn, Bluesky, Facebook, Reddit). |
| **User variable key** | Row variable for Upload Post user identifier. Required. |
| **API key variable key** | Row variable for Upload Post API key. Required. Use `uploadPostApiKey` or `apiKey`. |
| **Subreddit variable key** | Row variable for subreddit name (without `r/`). Required for Reddit posts. |
| **Facebook Page ID variable key** | Row variable for Facebook Page ID. Required for Facebook text/photo posts. |
| **Pinterest Board ID variable key** | Row variable for Pinterest Board ID. Required for Pinterest photo/video posts. |
| **Scheduled date variable** | Optional. Row variable with ISO-8601 date for scheduled publish. |
| **Async upload** | If checked, returns immediately with `request_id`; use Upload Status endpoint to poll. |
| **First comment variable** | Optional. Row variable for auto-posted first comment. |
| **Extra fields variable** | Optional. Row variable containing a JSON object of additional platform-specific params (e.g. `privacy_level`, `media_type`, `visibility`, `flair_id`). All key-value pairs are forwarded to the API. |
| **Save response to variable** | Row variable to store API response (full body or results). |
| **Save status code to variable** | Optional. Row variable to store HTTP status code. |
| **Timeout (ms)** | Request timeout. Default 120000 (2 min) for large uploads. |

## Platform defaults

Global and per-profile defaults for platform-specific API fields (privacy, media type, first comment, page/board IDs, etc.) are edited under **Settings → Upload Post Platform Defaults**. The extension stores them in `chrome.storage.local` (`uploadPostPlatformDefaults`); with a **project folder** set, the same data is read/written as **`config/platform-defaults.json`**. See **docs/PLATFORM_DEFAULTS.md**.

## Supported Platforms

- TikTok, Instagram, LinkedIn, YouTube, Facebook, X (Twitter), Threads, Pinterest, Bluesky, Reddit, Google Business Profile

### Platform-specific required fields

| Platform | Required for | Field |
|----------|-------------|-------|
| Reddit | All post types | `subreddit` |
| Facebook | Text & photo posts | `facebook_page_id` |
| Pinterest | Photo & video posts | `pinterest_board_id` |
| YouTube | Video posts | `title` |

## Variable Resolution

Values are resolved from the current row using the configured variable keys. Use `{{variableName}}` in title/description for substitution.

### Example: Video upload

```json
{
  "platform": "tiktok,instagram",
  "videoUrl": "https://example.com/video.mp4",
  "title": "My Video {{campaignName}}",
  "user": "my-upload-post-user",
  "uploadPostApiKey": "your-api-key"
}
```

### Example: Photo upload

```json
{
  "platform": "instagram,facebook",
  "photoUrls": "https://example.com/img1.jpg,https://example.com/img2.jpg",
  "title": "Photo carousel",
  "facebookPageId": "123456789",
  "user": "my-upload-post-user",
  "uploadPostApiKey": "your-api-key"
}
```

### Example: Text post

```json
{
  "platform": "x,linkedin,threads",
  "postType": "text",
  "title": "Just shipped a new feature!",
  "user": "my-upload-post-user",
  "uploadPostApiKey": "your-api-key"
}
```

### Example: Extra fields for platform-specific params

```json
{
  "platform": "reddit",
  "postType": "text",
  "title": "Check out this link!",
  "subreddit": "programming",
  "extraFields": "{\"flair_id\":\"abc123\",\"link_url\":\"https://example.com\"}"
}
```

## Authentication

Store your Upload Post API key in a row variable (e.g. `uploadPostApiKey`) and set **API key variable key** accordingly. Never put API keys literally in the workflow config.

## Testing

### Unit tests (step-tests.js)

- **parsePlatforms**: Single platform, comma-separated, array input, X alias, invalid filtering
- **parsePhotos**: Single URL, comma-separated, JSON array, array input, empty handling
- **parseExtraFields**: JSON string, object, null/empty, invalid, array rejection
- **detectPostType**: Video priority, photo priority, text fallback, empty default
- **Variable resolution**: `getRowValue` fallback order for video, photos, subreddit, facebookPageId, pinterestBoardId
