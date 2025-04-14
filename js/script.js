"use strict";

/* ================================================
   Global Variables and Initial Setup
   ================================================ */
let loadedPanels = [];
let currentChapter = 1; // Starting chapter

/* ================================================
   Helper Functions
   ================================================ */

/**
 * Returns a URL-friendly slug generated from the manga title.
 * Assumes an element with id "manga-id" exists.
 * @returns {string} The manga slug.
 */
const getMangaSlug = () => {
  const titleElem = document.getElementById("manga-id");
  const title = titleElem ? titleElem.textContent : "";
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
};

/**
 * Constructs the base path for a given chapter using the manga slug.
 * @param {number|string} chapter - The chapter number.
 * @returns {string} The base path URL.
 */
const getBasePath = (chapter) => {
  const slug = getMangaSlug();
  return `../manga/${slug}/chapter-${chapter}/`;
};

/**
 * Loads an image with a fallback to .jpg if the .webp fails.
 * @param {string} webpSrc - The source URL for the .webp image.
 * @param {string} jpgSrc - The fallback source URL for the .jpg image.
 * @param {string} altText - The alt text for the image.
 * @param {object} [styles={}] - Optional styles to apply.
 * @returns {Promise} Resolves with an object indicating success and the image element.
 */
const loadImageWithFallback = (webpSrc, jpgSrc, altText, styles = {}) =>
  new Promise((resolve) => {
    const img = new Image();
    img.src = webpSrc;
    img.alt = altText;
    // Apply default styles
    img.style.width = "100%";
    img.style.display = "block";
    // Apply any additional styles passed in
    Object.assign(img.style, styles);

    // When image loads successfully, resolve with success.
    img.onload = () => resolve({ success: true, image: img });

    // On error, if not yet tried the fallback, set src to the jpg version.
    img.onerror = () => {
      if (!img.dataset.fallback) {
        img.dataset.fallback = "true";
        img.src = jpgSrc;
      } else {
        resolve({ success: false, image: null });
      }
    };
  });

/* ================================================
   Theme Functions
   ================================================ */

/**
 * Applies the given theme by setting a data attribute on the body and saving it to localStorage.
 * @param {string} theme - The theme to apply ("light" or "dark").
 */
const applyTheme = (theme) => {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
};

/**
 * Toggles the theme between "light" and "dark".
 */
const toggleTheme = () => {
  const currentTheme = document.body.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(newTheme);
};

/* ================================================
   Chapter Existence Check
   ================================================ */

/**
 * Checks if a chapter exists by attempting to load the first panel image.
 * If .webp is not found, it falls back to .jpg.
 * @param {number} chapterNumber - The chapter number to check.
 * @returns {Promise<boolean>} Resolves to true if the chapter exists, false otherwise.
 */
const checkChapterExists = async (chapterNumber) => {
  const basePath = getBasePath(chapterNumber);
  const mangaSlug = getMangaSlug();
  const webpSrc = `${basePath}${mangaSlug}-1.webp`;
  const jpgSrc = `${basePath}${mangaSlug}-1.jpg`;
  const result = await loadImageWithFallback(webpSrc, jpgSrc, "Chapter Existence Check");
  return result.success;
};

/* ================================================
   Navigation Button Update
   ================================================ */

/**
 * Updates the display of the previous and next chapter buttons.
 * @param {number} chapter - The current chapter number.
 */
const updateChapterButtons = async (chapter) => {
  const prevBtn = document.getElementById("prevChapterBtn");
  const nextBtn = document.getElementById("nextChapterBtn");

  if (prevBtn) {
    prevBtn.style.display = chapter <= 1 ? "none" : "inline-flex";
  }
  if (nextBtn) {
    const exists = await checkChapterExists(chapter + 1);
    nextBtn.style.display = exists ? "inline-flex" : "none";
  }
};

/* ================================================
   Load Manga Chapter Panels with Batched Concurrent Loading
   ================================================ */

/**
 * Loads all the panels for a given chapter.
 * Attempts to load panels in batches and stops when a panel cannot be loaded.
 * Fallback is provided from .webp to .jpg for each panel.
 * @param {number|string} chapterNumber - The chapter number to load.
 * @param {boolean} [scroll=false] - Whether to scroll to the chapter selection element.
 */
const loadChapter = async (chapterNumber, scroll = false) => {
  currentChapter = Number(chapterNumber);
  localStorage.setItem("lastChapter", currentChapter);

  // Update chapter select dropdown if it exists
  const chapterSelect = document.getElementById("chapterSelect");
  if (chapterSelect) {
    chapterSelect.value = currentChapter;
  }

  if (scroll) {
    const selectElem = document.getElementById("chapterSelect");
    if (selectElem) {
      window.scrollTo({
        top: selectElem.offsetTop,
        behavior: "smooth",
      });
    }
  }

  await updateChapterButtons(currentChapter);

  const mangaSlug = getMangaSlug();
  const basePath = getBasePath(currentChapter);
  const chapterContentDiv = document.getElementById("chapter-content");
  chapterContentDiv.innerHTML = "";
  loadedPanels = [];

  let panelNumber = 1;
  const batchSize = 5;
  let batchHasError = false;

  while (true) {
    const batchPromises = [];
    for (let i = 0; i < batchSize; i++) {
      const currentPanel = panelNumber + i;
      const webpSrc = `${basePath}${mangaSlug}-${currentPanel}.webp`;
      const jpgSrc = `${basePath}${mangaSlug}-${currentPanel}.jpg`;
      batchPromises.push(
        loadImageWithFallback(webpSrc, jpgSrc, `Panel ${currentPanel}`, {
          paddingBottom: "1px",
        })
      );
    }

    const results = await Promise.all(batchPromises);

    // Check if any image in the batch failed to load.
    for (const result of results) {
      if (!result.success) {
        batchHasError = true;
        break;
      }
      chapterContentDiv.appendChild(result.image);
      loadedPanels.push(result.image);
      panelNumber++;
    }

    if (batchHasError) {
      if (loadedPanels.length === 0) {
        chapterContentDiv.innerHTML = "<p>No panels found for this chapter.</p>";
      }
      break;
    }
  }

  // Append the final static image (e.g., an advertisement or end-of-chapter image)
  const finalImg = new Image();
  finalImg.src = "../images/otaku-manga-ads.jpg";
  finalImg.alt = "End of Chapter";
  finalImg.style.width = "100%";
  finalImg.style.display = "block";
  finalImg.style.marginBottom = "20px";
  chapterContentDiv.appendChild(finalImg);

  await updateChapterButtons(currentChapter);
};

/* ================================================
   Download Chapter as PDF
   ================================================ */

/**
 * Initiates the download of the current chapter as a PDF.
 */
const downloadChapterAsPDF = async () => {
  const mangaSlug = getMangaSlug();
  // Format slug for display (capitalize first letter of each word)
  const formattedSlug = mangaSlug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("-");
  const pdfUrl = `../manga/${mangaSlug}/${formattedSlug}-Chapter-${currentChapter}.pdf`;
  const link = document.createElement("a");
  link.href = pdfUrl;
  link.download = `${formattedSlug}-Chapter-${currentChapter}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/* ================================================
   Search Functionality for Manga Titles
   ================================================ */

/**
 * Sets up the search functionality to filter manga titles.
 */
const setupSearch = () => {
  const searchBar = document.getElementById("searchBar");
  if (!searchBar) return;

  searchBar.addEventListener("input", function () {
    const query = this.value.toLowerCase();
    const books = document.querySelectorAll(".book");
    let visibleCount = 0;

    books.forEach((book) => {
      // Skip the placeholder card during filtering.
      if (book.id === "noResultsPlaceholder") return;
      const titleElem = book.querySelector(".info h3");
      if (!titleElem) return;
      const title = titleElem.textContent.toLowerCase();
      if (title.includes(query)) {
        book.style.display = "inline-block";
        visibleCount++;
      } else {
        book.style.display = "none";
      }
    });

    updatePlaceholder(visibleCount);
  });
};

/**
 * Updates the manga display with a placeholder if no manga cards match the search.
 * @param {number} visibleCount - The number of visible manga cards.
 */
const updatePlaceholder = (visibleCount) => {
  const mangaSection = document.getElementById("manga");
  let placeholder = document.getElementById("noResultsPlaceholder");

  if (visibleCount === 0) {
    if (!placeholder) {
      placeholder = document.createElement("article");
      placeholder.id = "noResultsPlaceholder";
      placeholder.className = "book placeholder";
      placeholder.innerHTML = `
        <img src="./images/404-cover.png" alt="No Manga Found" />
        <div class="info">
          <h3>Manga ရှာမတွေ့ပါ</h3>
          <p>နောက်မှပြန်လာခဲ့ပါ 😔</p>
        </div>
      `;
      mangaSection.appendChild(placeholder);
    }
  } else {
    if (placeholder) {
      placeholder.remove();
    }
  }
};

/* ================================================
   Responsive Layout Update for Book Header
   ================================================ */

/**
 * Adjusts the layout of the book header based on the effective aspect ratio of its image.
 */
const updateLayout = () => {
  const bookHeader = document.querySelector(".book-header");
  if (!bookHeader) return;
  const img = bookHeader.querySelector("img");
  if (!img) return;

  if (!img.complete) {
    img.onload = updateLayout;
    return;
  }

  const rect = img.getBoundingClientRect();
  const effectiveAspectRatio = rect.width / rect.height;
  const targetAspectRatio = 0.5; // Example threshold

  if (effectiveAspectRatio < targetAspectRatio) {
    bookHeader.classList.add("stretched");
  } else {
    bookHeader.classList.remove("stretched");
  }
};

/* ================================================
   Event Listeners Setup on DOMContentLoaded
   ================================================ */
document.addEventListener("DOMContentLoaded", () => {
  // Initialize theme
  const savedTheme = localStorage.getItem("theme") || "light";
  applyTheme(savedTheme);

  // Setup theme toggle button
  const toggleButton = document.getElementById("toggleButton");
  if (toggleButton) {
    toggleButton.classList.toggle("dark", savedTheme === "dark");
    toggleButton.addEventListener("click", () => {
      toggleTheme();
      toggleButton.classList.toggle("dark");
    });
  }

  // Chapter selection dropdown listener
  const chapterSelect = document.getElementById("chapterSelect");
  if (chapterSelect) {
    chapterSelect.addEventListener("change", function () {
      loadChapter(this.value, true);
    });
  }

  // Mobile chapter links listener
  document.querySelectorAll(".dropdown-content a[data-chapter]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const chapter = link.getAttribute("data-chapter");
      loadChapter(chapter, true);
      if (chapterSelect) chapterSelect.value = chapter;
    });
  });

  // PDF download button listener
  const downloadBtn = document.getElementById("downloadPdfBtn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadChapterAsPDF);
  }

  // Previous and Next chapter buttons listeners
  const prevBtn = document.getElementById("prevChapterBtn");
  const nextBtn = document.getElementById("nextChapterBtn");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentChapter > 1) loadChapter(currentChapter - 1, true);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", async () => {
      if (await checkChapterExists(currentChapter + 1)) {
        loadChapter(currentChapter + 1, true);
      }
    });
  }

  // Load the last visited chapter or default to the first one.
  const savedChapter = localStorage.getItem("lastChapter");
  loadChapter(chapterSelect ? savedChapter || chapterSelect.value : savedChapter || 1);

  // Initialize search functionality
  setupSearch();

  // Update layout on load and on resize
  updateLayout();
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(updateLayout, 100);
  });
});

/* ================================================
   Header Hide on Scroll
   ================================================ */
let lastScrollY = window.scrollY;
const header = document.getElementById("site-header");
const scrollThreshold = 100;

window.addEventListener("scroll", () => {
  const currentScrollY = window.scrollY;
  if (currentScrollY > scrollThreshold) {
    header.style.transform = currentScrollY > lastScrollY ? "translateY(-100%)" : "translateY(0)";
  } else {
    header.style.transform = "translateY(0)";
  }
  lastScrollY = currentScrollY;
});
