/**
 * Single source of truth: main-frame content script bundle (order matters).
 * Must match manifest.json → content_scripts[0].js.
 * Validate: npm run check:content-bundle
 *
 * Service worker imports this file for the file list only — do not concatenate
 * content-script sources here (MV3 SW has no `window` / DOM).
 */
var CFS_CONTENT_SCRIPT_TAB_BUNDLE_FILES = [
  "shared/selectors.js",
  "shared/recording-value.js",
  "shared/selector-parity.js",
  "shared/manifest-loader.js",
  "shared/template-resolver.js",
  "shared/row-list-normalize.js",
  "shared/run-if-condition.js",
  "shared/project-id-resolve.js",
  "shared/personal-info-sync.js",
  "shared/removed-step-types.js",
  "steps/registry.js",
  "steps/loader.js",
  "content/recorder.js",
  "content/player.js",
  "shared/discovery-input-normalize.js",
  "content/auto-discovery.js"
];
