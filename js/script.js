"use strict";

/* ================================================
   Global Variables
   ================================================ */

// Holds all loaded image panels for the current chapter
let loadedPanels = [];

// Array of chapter IDs (strings like "1", "7.1", "7.2", "8") read from the <select>
let chapterList = [];

// The currently displayed chapter ID
let currentChapterId = null;

/* ================================================
   Utility Functions
   ================================================ */

/**
 * Read the <option> values from the #chapterSelect dropdown
 * and populate chapterList in the exact order they appear.
 */
function readChapterList() {
  const opts = document.querySelectorAll('#chapterSelect option');
  chapterList = Array.from(opts).map(o => o.value);
}

/**
 * Generate the storage key for saving "last read" per manga slug.
 */
function getStorageKey() {
  return `lastChapter-${getMangaSlug()}`;
}

/**
 * Slugifies the manga ID text into a folder-friendly string,
 * e.g. "My Manga Title" → "my-manga-title"
 */
function getMangaSlug() {
  const titleElem = document.getElementById("manga-id");
  const title = titleElem ? titleElem.textContent : "";
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
}

/**
 * Capitalize the first letter of a word (for PDF filenames).
 */
function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/* ================================================
   Theme Toggle Functions
   ================================================ */

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
}

function toggleTheme() {
  const current = document.body.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
}

/* ================================================
   Image Loading Helper
   ================================================ */

/**
 * Try to load a .webp, fall back to .jpg if it fails.
 * Resolves with { success, image }.
 */
function loadImageWithFallback(webpSrc, jpgSrc, altText, styles = {}) {
  return new Promise(resolve => {
    const img = new Image();
    img.src = webpSrc;
    img.alt = altText;
    Object.assign(img.style, { width: "100%", display: "block", ...styles });

    img.onload = () => resolve({ success: true, image: img });
    img.onerror = () => {
      if (!img.dataset.fallback) {
        img.dataset.fallback = "true";
        img.src = jpgSrc;
      } else {
        resolve({ success: false, image: null });
      }
    };
  });
}

/* ================================================
   Chapter Loading & Navigation
   ================================================ */

/**
 * Load and render a chapter by its ID (string like "7.1").
 * Handles updating the dropdown, history, panels, and nav buttons.
 */
async function loadChapter(chapId, scroll = false) {
  currentChapterId = chapId;
  localStorage.setItem(getStorageKey(), chapId);

  // Update the <select> UI
  const sel = document.getElementById("chapterSelect");
  if (sel) sel.value = chapId;

  // Optionally scroll back up to the selector
  if (scroll && sel) {
    window.scrollTo({ top: sel.offsetTop, behavior: "smooth" });
  }

  // Build the folder name: "7.1" → "7-1"
  const folderName = chapId.replace(/\./g, "-");
  const slug       = getMangaSlug();
  const basePath   = `../manga/${slug}/chapter-${folderName}/`;

  // Clear out any existing panels
  const contentDiv = document.getElementById("chapter-content");
  contentDiv.innerHTML = "";
  loadedPanels = [];

  // Batch-load panels until failure
  let panelNumber = 1;
  const batchSize = 5;
  let errorHit    = false;

  while (!errorHit) {
    const batch = [];
    for (let i = 0; i < batchSize; i++) {
      const num     = panelNumber + i;
      const webp    = `${basePath}${slug}-${num}.webp`;
      const jpg     = `${basePath}${slug}-${num}.jpg`;
      batch.push(loadImageWithFallback(webp, jpg, `Panel ${num}`, { paddingBottom: "1px" }));
    }

    const results = await Promise.all(batch);
    for (const res of results) {
      if (!res.success) {
        errorHit = true;
        break;
      }
      contentDiv.appendChild(res.image);
      loadedPanels.push(res.image);
      panelNumber++;
    }
  }

  // Add end-of-chapter ad
  const endImg = new Image();
  endImg.src         = "../images/otaku-manga-ads.jpg";
  endImg.alt         = "End of Chapter";
  Object.assign(endImg.style, { width: "100%", display: "block", marginBottom: "20px" });
  contentDiv.appendChild(endImg);

  // Refresh prev/next button visibility
  updatePrevNextButtons();
}

/**
 * Show or hide the Prev/Next buttons based on
 * where currentChapterId sits in chapterList.
 */
function updatePrevNextButtons() {
  const idx     = chapterList.indexOf(currentChapterId);
  const prevBtn = document.getElementById("prevChapterBtn");
  const nextBtn = document.getElementById("nextChapterBtn");

  prevBtn.style.display = idx > 0                   ? "inline-flex" : "none";
  nextBtn.style.display = idx < chapterList.length - 1 ? "inline-flex" : "none";
}

/**
 * Download the current chapter as a PDF.
 * Assumes PDF file is named:
 *   <FormattedSlug>-Chapter-<folderName>.pdf
 */
function downloadChapterAsPDF() {
  const slug          = getMangaSlug();
  const formattedSlug = slug
    .split("-")
    .map(capitalize)
    .join("-");
  const folderName = currentChapterId.replace(/\./g, "-");
  const url        = `../manga/${slug}/${formattedSlug}-Chapter-${folderName}.pdf`;

  const link = document.createElement("a");
  link.href    = url;
  link.download = `${formattedSlug}-Chapter-${folderName}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ================================================
   Search Filtering (if used elsewhere on site)
   ================================================ */

function setupSearch() {
  const searchBar = document.getElementById("searchBar");
  if (!searchBar) return;
  searchBar.addEventListener("input", function () {
    const query = this.value.toLowerCase();
    const books = document.querySelectorAll(".book");
    let visible = 0;

    books.forEach(book => {
      if (book.id === "noResultsPlaceholder") return;
      const title = book.querySelector(".info h3")?.textContent.toLowerCase() || "";
      if (title.includes(query)) {
        book.style.display = "inline-block";
        visible++;
      } else {
        book.style.display = "none";
      }
    });
    updatePlaceholder(visible);
  });
}

function updatePlaceholder(visibleCount) {
  const mangaSection = document.getElementById("manga");
  let placeholder = document.getElementById("noResultsPlaceholder");
  if (visibleCount === 0) {
    if (!placeholder) {
      placeholder = document.createElement("article");
      placeholder.id    = "noResultsPlaceholder";
      placeholder.className = "book placeholder";
      placeholder.innerHTML = `
        <img src="./images/404-cover.png" alt="No Manga Found" />
        <div class="info">
          <h3>No Manga Found</h3>
          <p>😔 Try again later!</p>
        </div>`;
      mangaSection.appendChild(placeholder);
    }
  } else if (placeholder) {
    placeholder.remove();
  }
}

/* ================================================
   Responsive Header & Layout
   ================================================ */

function updateLayout() {
  const bookHeader = document.querySelector(".book-header");
  if (!bookHeader) return;
  const img = bookHeader.querySelector("img");
  if (!img || !img.complete) {
    if (img) img.onload = updateLayout;
    return;
  }

  const ratio    = img.getBoundingClientRect().width / img.getBoundingClientRect().height;
  const threshold = 0.5;
  bookHeader.classList.toggle("stretched", ratio < threshold);
}

/* ================================================
   Initialization on DOMContentLoaded
   ================================================ */

document.addEventListener("DOMContentLoaded", () => {
  // 1. Apply saved theme
  const savedTheme = localStorage.getItem("theme") || "light";
  applyTheme(savedTheme);
  const toggleBtn = document.getElementById("toggleButton");
  if (toggleBtn) {
    toggleBtn.classList.toggle("dark", savedTheme === "dark");
    toggleBtn.addEventListener("click", () => {
      toggleTheme();
      toggleBtn.classList.toggle("dark");
    });
  }

  // 2. Read the chapter list from the <select>
  readChapterList();

  // 3. Determine which chapter to show
  const params = new URLSearchParams(window.location.search);
  const paramChap = params.get("chapter");
  const savedChap = localStorage.getItem(getStorageKey());
  currentChapterId = paramChap || savedChap || chapterList[0];
  if (!chapterList.includes(currentChapterId)) {
    currentChapterId = chapterList[0];
  }

  // 4. Load that chapter
  loadChapter(currentChapterId);

  // 5. Wire up UI controls
  document.getElementById("chapterSelect").addEventListener("change", e => {
    loadChapter(e.target.value, true);
  });
  document.getElementById("prevChapterBtn").addEventListener("click", () => {
    const idx = chapterList.indexOf(currentChapterId);
    loadChapter(chapterList[idx - 1], true);
  });
  document.getElementById("nextChapterBtn").addEventListener("click", () => {
    const idx = chapterList.indexOf(currentChapterId);
    loadChapter(chapterList[idx + 1], true);
  });
  document.getElementById("downloadPdfBtn").addEventListener("click", downloadChapterAsPDF);

  // 6. Optional site-wide search
  setupSearch();

  // 7. Handle layout changes on resize
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(updateLayout, 100);
  });
  updateLayout();
});

/* ================================================
   Hide Header on Scroll Down, Show on Scroll Up
   ================================================ */
let lastScrollY = window.scrollY;
const header     = document.getElementById("site-header");
const threshold  = 100;

window.addEventListener("scroll", () => {
  const currentY = window.scrollY;
  if (currentY > threshold) {
    header.style.transform = currentY > lastScrollY ? "translateY(-100%)" : "translateY(0)";
  } else {
    header.style.transform = "translateY(0)";
  }
  lastScrollY = currentY;
});
