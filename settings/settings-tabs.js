// Settings sidebar tab navigation
document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('.sidebar .nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');

  function activateTab(targetId) {
    const targetPane = document.getElementById(targetId);
    if (!targetPane) return false;
    navItems.forEach(nav => nav.classList.remove('active'));
    tabPanes.forEach(pane => pane.classList.remove('active'));
    const navItem = document.querySelector(`.sidebar .nav-item[data-target="${targetId}"]`);
    if (navItem) navItem.classList.add('active');
    targetPane.classList.add('active');
    document.querySelector('.content-container').scrollTop = 0;
    return true;
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const targetId = e.currentTarget.getAttribute('data-target');
      activateTab(targetId);
    });
  });

  // Deep-link: open settings.html#tab-tests → activate Tests tab
  const hash = location.hash.replace('#', '');
  if (hash) activateTab(hash);
});
