(function(){
  const root = document.documentElement;
  const key = 'otaku-theme';

  function setSwitch(isDark){
    const btn = document.getElementById('theme-toggle');
    if(btn){
      btn.setAttribute('aria-checked', String(isDark));
      btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    }
  }
  function apply(theme){
    root.setAttribute('data-theme', theme);
    setSwitch(theme === 'dark');
  }

  // initial theme
  const saved = localStorage.getItem(key);
  if(saved){
    apply(saved);
  } else {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    apply(prefersDark ? 'dark' : 'light');
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    // Theme toggle
    const toggle = document.getElementById('theme-toggle');
    toggle?.addEventListener('click', ()=>{
      const next = (root.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
      apply(next);
      localStorage.setItem(key, next);
    });

    // Sync with OS changes if user hasn't explicitly chosen
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', (e)=>{
      if(!localStorage.getItem(key)){
        apply(e.matches ? 'dark' : 'light');
      }
    });

    // Mobile menu
    const menuBtn  = document.getElementById('menu-btn');
    const mobileNav = document.getElementById('mobile-nav');
    const header = document.querySelector('.site-header');

    function syncHeaderOffset(){
      const h = header ? (header.classList.contains('is-hidden') ? 0 : (header.getBoundingClientRect().height || 0)) : 0;
      root.style.setProperty('--header-offset', h + 'px');
      root.classList.toggle('header-hidden', !!(header && header.classList.contains('is-hidden')));
    }

    if(menuBtn && mobileNav){
      mobileNav.hidden = true;
      menuBtn.addEventListener('click', ()=>{
        const open = menuBtn.getAttribute('aria-expanded') === 'true';
        menuBtn.setAttribute('aria-expanded', String(!open));
        mobileNav.hidden = open;
        if(!open && header) header.classList.remove('is-hidden'); // keep visible while menu open
        syncHeaderOffset();
      });
    }

    // ----- Auto-hide header on scroll -----
    if(header){
      let lastY = window.scrollY;
      let ticking = false;

      const nearTop = () => window.scrollY < 64;
      const menuOpen = () => menuBtn && menuBtn.getAttribute('aria-expanded') === 'true';
      const focusInHeader = () => header.contains(document.activeElement);

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

      // initial sync
      syncHeaderOffset();

      window.addEventListener('scroll', ()=>{
        if(!ticking){
          ticking = true;
          requestAnimationFrame(onScrollFrame);
        }
      }, { passive:true });

      // Keep visible while interacting in header
      header.addEventListener('mouseenter', ()=> header.classList.remove('is-hidden'));
      header.addEventListener('focusin',   ()=> header.classList.remove('is-hidden'));
      window.addEventListener('resize', syncHeaderOffset, {passive:true});
    }

    // Smooth in-page anchors
    document.querySelectorAll('a[href^="#"]').forEach(a=>{
      a.addEventListener('click', (e)=>{
        const id = a.getAttribute('href').slice(1);
        const el = document.getElementById(id);
        if(el){ e.preventDefault(); el.scrollIntoView({behavior:'smooth'}); }
      });
    });
  });
})();
