/**
 * Content Generator: sidepanel link and any legacy hooks.
 * Bundled templates live under generator/templates/; project templates load from the linked uploads/ tree.
 */
(function() {
  'use strict';

  const openSidepanelWrap = document.getElementById('openSidepanelWrap');
  const openSidepanelLink = document.getElementById('openSidepanelLink');
  if (chrome?.sidePanel && openSidepanelLink) {
    if (openSidepanelWrap) openSidepanelWrap.style.display = 'block';
    openSidepanelLink.addEventListener('click', function(e) {
      e.preventDefault();
      chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    });
  }
})();
