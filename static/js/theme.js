// Otaku Manga — Site script (dark-only)
// - Force dark theme (no toggle, no OS sync)
// - Header auto-hide on scroll
// - Mobile menu sheet
// - Smooth in-page anchors
// - Keeps --header-offset CSS var in sync for reader pill placement

(function () {
  const root = document.documentElement;

  // Force dark mode once, no localStorage / OS sync
  root.setAttribute('data-theme', 'dark');

  document.addEventListener('DOMContentLoaded', () => {
    const header   = document.querySelector('.site-header');
    const menuBtn  = document.getElementById('menu-btn');
    const mobileNav= document.getElementById('mobile-nav');

    // --- Mobile menu
    if (menuBtn && mobileNav) {
      mobileNav.hidden = true;
      menuBtn.addEventListener('click', () => {
        const open = menuBtn.getAttribute('aria-expanded') === 'true';
        menuBtn.setAttribute('aria-expanded', String(!open));
        mobileNav.hidden = open;
        // keep header visible while menu is open
        if (!open && header) header.classList.remove('is-hidden');
        syncHeaderOffset();
      });
    }

    // --- Header auto-hide on scroll
    function syncHeaderOffset(){
      if (!header) return;
      const hidden = header.classList.contains('is-hidden');
      const h = hidden ? 0 : (header.getBoundingClientRect().height || 0);
      root.style.setProperty('--header-offset', h + 'px');
      root.classList.toggle('header-hidden', hidden); // used by .reader-info to hide with header
    }

    if (header) {
      let lastY = window.scrollY;
      let ticking = false;

      const nearTop      = () => window.scrollY < 64;
      const menuOpen     = () => menuBtn && menuBtn.getAttribute('aria-expanded') === 'true';
      const focusInHeader= () => header.contains(document.activeElement);

      function onScrollFrame(){
        const y = window.scrollY;
        const delta = y - lastY;

        if (delta < -8 || nearTop() || menuOpen() || focusInHeader()){
          header.classList.remove('is-hidden');
        } else if (delta > 8 && y > 120){
          header.classList.add('is-hidden');
        }

        lastY = y;
        syncHeaderOffset();
        ticking = false;
      }

      syncHeaderOffset();

      window.addEventListener('scroll', () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(onScrollFrame);
        }
      }, { passive: true });

      header.addEventListener('mouseenter', () => header.classList.remove('is-hidden'));
      header.addEventListener('focusin',   () => header.classList.remove('is-hidden'));
      window.addEventListener('resize', syncHeaderOffset, { passive: true });
    }

    // --- Smooth in-page anchors
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href').slice(1);
        const el = document.getElementById(id);
        if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth' }); }
      });
    });
  });
})();
