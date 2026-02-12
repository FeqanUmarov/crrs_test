(function initRightToolsToggle() {
  function boot() {
    const shell = document.getElementById('rightToolsShell');
    const toggleBtn = document.getElementById('rightToolsToggle');
    const rightTools = document.getElementById('rightTools');

    if (!shell || !toggleBtn || !rightTools) return;

    const updateToggleMeta = () => {
      const collapsed = shell.classList.contains('is-collapsed');
      const label = collapsed ? 'Sağ alətləri aç' : 'Sağ alətləri yığ';
      toggleBtn.setAttribute('aria-label', label);
      toggleBtn.dataset.tooltip = label;
    };

    toggleBtn.addEventListener('click', () => {
      shell.classList.toggle('is-collapsed');
      updateToggleMeta();
    });

    rightTools.addEventListener('click', (event) => {
      const btn = event.target.closest('.rt-btn');
      if (!btn || !rightTools.contains(btn)) return;

      rightTools
        .querySelectorAll('.rt-btn.is-selected')
        .forEach((node) => node.classList.remove('is-selected'));

      btn.classList.add('is-selected');
    });

    const activeBtn = rightTools.querySelector('.rt-btn.active');
    if (activeBtn) {
      activeBtn.classList.add('is-selected');
    }

    updateToggleMeta();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();