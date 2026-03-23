# Upload Post platform defaults

This document explains how **Settings → Upload Post Platform Defaults** relates to **`config/platform-defaults.json`** and what the extension reads at runtime.

## Summary

| Layer | Role |
|--------|------|
| **Settings UI** (`settings/settings.html`) | Edit global defaults per platform, or per-profile overrides. |
| **`chrome.storage.local`** key `uploadPostPlatformDefaults` | Canonical copy the extension uses when resolving defaults for uploads. |
| **`config/platform-defaults.json`** | Optional on-disk mirror of the same object when a **project folder** is set. |

The committed file at **`config/platform-defaults.json`** is the same JSON shape the settings page loads and saves. It is useful for version control and sharing defaults across machines once the project folder points at this repo.

## JSON shape

- **`_profiles`** – Object keyed by Upload Post profile username. Each value is an object keyed by platform id (`youtube`, `instagram`, …) with field objects (same keys as the API, e.g. `privacyStatus`, `media_type`, `first_comment`).
- **Top-level platform keys** (e.g. `youtube`) – Global defaults for all profiles unless a profile entry overrides that platform.

Empty `_profiles` is normal: `{}`.

## Load path (settings)

Implementation: **`settings/settings.js`** (`loadPlatformDefaults`).

1. If the user has granted a **stored project folder** and **`config/platform-defaults.json`** exists and parses as a non-array object, that object becomes the in-memory cache and is **written into** `chrome.storage.local` under `uploadPostPlatformDefaults`.
2. Otherwise, defaults are read **only** from `uploadPostPlatformDefaults` in `chrome.storage.local` (or start empty).

So: **no project folder or no file → the JSON on disk is not used**; the UI still works from extension storage.

## Save path (settings)

**Save Defaults** and **Clear This Scope** (`savePlatformDefaults`, `clearPlatformDefaults`):

1. Update the in-memory object and set `uploadPostPlatformDefaults` in `chrome.storage.local`.
2. If a project folder is available, **write** `config/platform-defaults.json` with the full merged object.

## Runtime (upload step)

The **`uploadPost`** step resolves defaults from **`chrome.storage.local`** (`uploadPostPlatformDefaults`), not by re-reading the JSON file. See **`steps/uploadPost/handler.js`**. After opening settings with a project folder, loading the page syncs file → storage, so uploads see the same data.

## Merge priority (user-facing)

As shown in Settings, precedence from highest to lowest is:

1. Generator / step fields and explicit row data  
2. Workflow variables  
3. Per-profile + platform defaults (`_profiles[username][platform]`)  
4. Global platform defaults (top-level `youtube`, etc.)

For field-level detail, use the Settings page; **`steps/uploadPost/generator-ui.js`** also uses `uploadPostPlatformDefaults` for generator UI behavior.

## Related docs

- **`docs/UPLOAD_POST_POSTS_SPEC.md`** – `defaults_used` on saved posts records which defaults applied at post time.  
- **`steps/uploadPost/README.md`** – Upload Post step configuration.
