// Otaku Manga — Reader script
// - Sticky info pill offset (tracks header auto-hide)
// - Tap/Click anywhere on reading surface toggles header + info pill
// - Scroll position restore/save per chapter
// - Keyboard nav (←/→, Space/PageDown, T)
// - Preload upcoming pages
// - Floating FABs + sticky bar idle fade

(function () {
  var reader = document.querySelector(".reader");
  if (!reader) return;

  var root   = document.documentElement;
  var header = document.querySelector(".site-header");
  var pages  = Array.prototype.slice.call(document.querySelectorAll(".page img"));
  var slug   = reader.getAttribute("data-slug") || "";
  var chapter= reader.getAttribute("data-chapter") || "";
  var storageKey = "otaku-pos:" + slug + ":" + chapter;

  // ---------- Helpers ----------
  function isInteractive(el) {
    return !!(el.closest("a, button, input, textarea, select, label, .reader-header, .site-header, .sticky-bar, .fab-btn, .nav, .page-num"));
  }

  function setHeaderHidden(hidden) {
    if (!header) return;
    header.classList.toggle("is-hidden", !!hidden);
    root.classList.toggle("header-hidden", !!hidden);
    updateOffset(); // keep sticky pill in the right place
  }

  function updateOffset() {
    if (!header) return;
    var hidden = header.classList.contains("is-hidden");
    var h = header.getBoundingClientRect().height || 0;
    root.style.setProperty("--header-offset", hidden ? "0px" : (h + "px"));
  }

  // ---------- Keep sticky info pill below header ----------
  (function setupStickyOffset(){
    if (!header) return;
    updateOffset();
    window.addEventListener("resize", updateOffset, {passive:true});

    // Track hide/show state that scroll code in theme.js applies
    var ticking = false;
    window.addEventListener("scroll", function(){
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function(){
        // Sync 'header-hidden' flag to drive .reader-info CSS hide
        var hidden = header.classList.contains("is-hidden");
        root.classList.toggle("header-hidden", hidden);
        updateOffset();
        ticking = false;
      });
    }, {passive:true});
  })();

  // ---------- Tap/Click to toggle UI (header + pill) ----------
  ["click","pointerup","touchend"].forEach(function(ev){
    reader.addEventListener(ev, function(e){
      // Ignore real interactions & selections
      if (e.defaultPrevented) return;
      var t = e.target;
      if (isInteractive(t)) return;
      var sel = window.getSelection && window.getSelection().toString();
      if (sel && sel.length > 0) return;

      // Only toggle if you clicked the reading surface:
      if (!t.closest(".pages") && !t.closest(".page")) return;

      var hidden = header && header.classList.contains("is-hidden");
      setHeaderHidden(!hidden); // reveal if hidden, hide if visible
    }, {passive:true});
  });

  // ---------- Restore saved scroll position ----------
  var saved = sessionStorage.getItem(storageKey);
  if (saved) {
    setTimeout(function () {
      var y = parseInt(saved, 10);
      if (!isNaN(y)) window.scrollTo(0, y);
    }, 50);
  }

  // ---------- Save scroll position ----------
  var saving = false;
  window.addEventListener("scroll", function () {
    if (saving) return;
    saving = true;
    requestAnimationFrame(function () {
      try { sessionStorage.setItem(storageKey, String(window.scrollY || 0)); } catch (e) {}
      saving = false;
    });
  }, { passive: true });

  // ---------- Keyboard navigation ----------
  function textHas(hay, needles) {
    hay = (hay || "").toLowerCase();
    for (var i = 0; i < needles.length; i++) if (hay.indexOf(needles[i]) !== -1) return true;
    return false;
  }
  function findNavLink(type) {
    var byFab = document.querySelector(".fab-btn." + type);
    if (byFab) return byFab;
    var links = Array.prototype.slice.call(
      document.querySelectorAll(".reader-header .nav a, .reader-footer .nav a, .sticky-bar a")
    );
    for (var i = 0; i < links.length; i++) {
      var txt = (links[i].textContent || "").trim();
      if (type === "prev" && textHas(txt, ["prev", "⟵", "←"])) return links[i];
      if (type === "next" && textHas(txt, ["next", "⟶", "→"])) return links[i];
    }
    if (links.length === 2) return type === "prev" ? links[0] : links[1];
    return null;
  }
  function scrollToNextImage() {
    for (var i = 0; i < pages.length; i++) {
      var r = pages[i].getBoundingClientRect();
      if (r.top > 16) {
        pages[i].scrollIntoView({ behavior: "smooth", block: "start" });
        return true;
      }
    }
    return false;
  }

  document.addEventListener("keydown", function (e) {
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if (e.key === "ArrowLeft") {
      var prev = findNavLink("prev");
      if (prev) { e.preventDefault(); prev.click(); }
    } else if (e.key === "ArrowRight") {
      var next = findNavLink("next");
      if (next) { e.preventDefault(); next.click(); }
    } else if (e.key === " " || e.key === "PageDown") {
      e.preventDefault();
      if (!scrollToNextImage()) {
        var nx = findNavLink("next");
        if (nx) nx.click();
      }
    } else if ((e.key || "").toLowerCase() === "t") {
      var toggle = document.getElementById("theme-toggle");
      if (toggle) toggle.click();
    } else if ((e.key || "").toLowerCase() === "h") {
      // Optional: H to toggle header as well
      var hidden = header && header.classList.contains("is-hidden");
      setHeaderHidden(!hidden);
    }
  });

  // ---------- Preload upcoming pages ----------
  pages.forEach(function (img, i) {
    img.addEventListener("load", function () {
      for (var j = i + 1; j < i + 4 && j < pages.length; j++) {
        var n = new Image();
        n.src = pages[j].src;
      }
    }, { once: true });
  });

  // ---------- Idle fade for FABs + sticky bar ----------
  var fab = document.querySelector(".fab-nav");
  var stickyBar = document.querySelector(".sticky-bar");
  if (fab || stickyBar) {
    var idleTimer;
    function setIdle(state) {
      if (fab) fab.classList.toggle("is-idle", !!state);
      if (stickyBar) stickyBar.classList.toggle("is-idle", !!state);
    }
    function bump() {
      setIdle(false);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { setIdle(true); }, 1500);
    }
    ["mousemove","scroll","keydown","touchstart"].forEach(function(ev){
      window.addEventListener(ev, bump, { passive:true });
    });
    bump();
  }
})();
