(function() {
  const THEME_KEY = 'sb_theme';

  function getPreferredTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  // Apply immediately
  applyTheme(getPreferredTheme());

  // Bind toggle buttons after DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#themeToggle').forEach(btn => {
      btn.addEventListener('click', toggleTheme);
    });
  });

  window.ThemeManager = { toggleTheme, applyTheme, getPreferredTheme };
})();