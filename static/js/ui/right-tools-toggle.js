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

    const syncSelectedButtons = () => {
      rightTools.querySelectorAll('.rt-btn').forEach((btn) => {
        btn.classList.toggle('is-selected', btn.classList.contains('active'));
      });
    };

    const selectionObserver = new MutationObserver((mutations) => {
      const shouldSync = mutations.some((mutation) => {
        if (mutation.type === 'childList') return true;
        return (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'class' &&
          mutation.target.classList?.contains('rt-btn')
        );
      });

      if (shouldSync) syncSelectedButtons();
    });
    selectionObserver.observe(rightTools, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class']
    });

    syncSelectedButtons();

    updateToggleMeta();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();