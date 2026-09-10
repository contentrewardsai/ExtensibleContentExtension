// Settings sidebar tab navigation + deep-link hashes
document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('.sidebar .nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');

  const HASH_TO_TAB = {
    'tab-general': 'tab-general',
    'tab-crypto': 'tab-crypto',
    'tab-workflows': 'tab-workflows',
    'tab-mcp': 'tab-mcp',
    'tab-tests': 'tab-tests',
    'cfs-llm-providers': 'tab-general',
    'cfs-llm-chat-default': 'tab-general',
    'cfsLlmSection': 'tab-general',
    'cfs-mcp-server': 'tab-mcp',
    'mcpServerSection': 'tab-mcp',
    'following-automation-global': 'tab-crypto',
  };

  function activateTab(targetId) {
    const targetPane = document.getElementById(targetId);
    if (!targetPane || !targetPane.classList.contains('tab-pane')) return false;
    navItems.forEach(nav => nav.classList.remove('active'));
    tabPanes.forEach(pane => pane.classList.remove('active'));
    const navItem = document.querySelector(`.sidebar .nav-item[data-target="${targetId}"]`);
    if (navItem) navItem.classList.add('active');
    targetPane.classList.add('active');
    document.querySelector('.content-container').scrollTop = 0;
    return true;
  }

  function activateFromHash(rawHash) {
    const hash = String(rawHash || '').replace(/^#/, '');
    if (!hash) return;
    const mapped = HASH_TO_TAB[hash];
    const el = document.getElementById(hash);
    const tabId = mapped || (el && el.classList.contains('tab-pane') ? hash : null);
    if (tabId) activateTab(tabId);
    if (el && !el.classList.contains('tab-pane')) {
      requestAnimationFrame(function () {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const targetId = e.currentTarget.getAttribute('data-target');
      activateTab(targetId);
      if (targetId && location.hash.replace('#', '') !== targetId) {
        try {
          history.replaceState(null, '', '#' + targetId);
        } catch (_) {}
      }
    });
  });

  activateFromHash(location.hash);
  window.addEventListener('hashchange', function () {
    activateFromHash(location.hash);
  });
});
