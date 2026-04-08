// Settings sidebar tab navigation
document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('.sidebar .nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const targetId = e.currentTarget.getAttribute('data-target');
      const targetPane = document.getElementById(targetId);
      if (!targetPane) return;
      navItems.forEach(nav => nav.classList.remove('active'));
      tabPanes.forEach(pane => pane.classList.remove('active'));
      e.currentTarget.classList.add('active');
      targetPane.classList.add('active');
      document.querySelector('.content-container').scrollTop = 0;
    });
  });
});
