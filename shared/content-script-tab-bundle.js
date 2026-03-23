/**
 * Single source of truth: main-frame content script bundle (order matters).
 * Must match manifest.json → content_scripts[0].js.
 * Validate: npm run check:content-bundle
 */
var CFS_CONTENT_SCRIPT_TAB_BUNDLE_FILES = [
  'shared/selectors.js',
  'shared/recording-value.js',
  'shared/selector-parity.js',
  'shared/manifest-loader.js',
  'shared/template-resolver.js',
  'steps/registry.js',
  'steps/loader.js',
  'content/recorder.js',
  'content/player.js',
  'content/auto-discovery.js',
];
