// Otaku Manga — Reader script
// - Sticky info pill offset (tracks header auto-hide)
// - Scroll position restore/save per chapter
// - Keyboard nav (←/→, Space/PageDown, T)
// - Preload upcoming pages
// - Floating FABs + sticky bottom "Next" with idle fade

(function () {
  var reader = document.querySelector(".reader");
  if (!reader) return;

  var pages = Array.prototype.slice.call(document.querySelectorAll(".page img"));
  var slug = reader.getAttribute("data-slug") || "";
  var chapter = reader.getAttribute("data-chapter") || "";
  var storageKey = "otaku-pos:" + slug + ":" + chapter;

  // ---------- Keep sticky info pill below header ----------
  (function setupStickyOffset(){
    var root = document.documentElement;
    var header = document.querySelector(".site-header");
    if (!header) return;

    function updateOffset(){
      var hidden = header.classList.contains("is-hidden");
      var h = header.getBoundingClientRect().height || 0;
      root.style.setProperty("--header-offset", hidden ? "0px" : (h + "px"));
      root.classList.toggle("header-hidden", hidden);
    }
    updateOffset();
    window.addEventListener("resize", updateOffset, {passive:true});
    var ticking = false;
    window.addEventListener("scroll", function(){
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function(){ updateOffset(); ticking = false; });
    }, {passive:true});
  })();

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
      document.querySelectorAll(".reader-header .nav a, .reader-footer .nav a")
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
    if (tag === "INPUT" || tag === "TEXTAREA") return;

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
