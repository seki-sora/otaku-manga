"use strict";

/* ================================================
   Global Variables and Initial Setup
   ================================================ */
let loadedPanels = [];
let currentChapter = 1;

/* ================================================
   Helper Functions
   ================================================ */
const getMangaSlug = () => {
  const titleElem = document.getElementById("manga-id");
  const title = titleElem ? titleElem.textContent : "";
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
};

const getBasePath = (chapter) => {
  const slug = getMangaSlug();
  return `../manga/${slug}/chapter-${chapter}/`;
};

const loadImageWithFallback = (webpSrc, jpgSrc, altText, styles = {}) =>
  new Promise((resolve) => {
    const img = new Image();
    img.src = webpSrc;
    img.alt = altText;
    img.style.width = "100%";
    img.style.display = "block";
    Object.assign(img.style, styles);

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

/* ================================================
   Theme Functions
   ================================================ */
const applyTheme = (theme) => {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
};

const toggleTheme = () => {
  const currentTheme = document.body.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(newTheme);
};

/* ================================================
   Chapter Existence Check
   ================================================ */
const checkChapterExists = async (chapterNumber) => {
  const basePath = getBasePath(chapterNumber);
  const slug = getMangaSlug();
  const webpSrc = `${basePath}${slug}-1.webp`;
  const jpgSrc = `${basePath}${slug}-1.jpg`;
  const result = await loadImageWithFallback(webpSrc, jpgSrc, "Chapter Check");
  return result.success;
};

/* ================================================
   Update Prev/Next Buttons
   ================================================ */
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

const getStorageKey = () => `lastChapter-${getMangaSlug()}`;

/* ================================================
   Load Manga Chapter Panels
   ================================================ */
const loadChapter = async (chapterNumber, scroll = false) => {
  currentChapter = Number(chapterNumber);
  localStorage.setItem(getStorageKey(), currentChapter);

  const chapterSelect = document.getElementById("chapterSelect");
  if (chapterSelect) {
    chapterSelect.value = currentChapter;
  }

  if (scroll) {
    const selectElem = document.getElementById("chapterSelect");
    if (selectElem) {
      window.scrollTo({ top: selectElem.offsetTop, behavior: "smooth" });
    }
  }

  await updateChapterButtons(currentChapter);

  const slug = getMangaSlug();
  const basePath = getBasePath(currentChapter);
  const chapterContentDiv = document.getElementById("chapter-content");
  chapterContentDiv.innerHTML = "";
  loadedPanels = [];

  let panelNumber = 1;
  const batchSize = 5;
  let batchHasError = false;

  while (true) {
    const batch = [];
    for (let i = 0; i < batchSize; i++) {
      const num = panelNumber + i;
      const webpSrc = `${basePath}${slug}-${num}.webp`;
      const jpgSrc = `${basePath}${slug}-${num}.jpg`;
      batch.push(
        loadImageWithFallback(webpSrc, jpgSrc, `Panel ${num}`, { paddingBottom: "1px" })
      );
    }

    const results = await Promise.all(batch);

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
const downloadChapterAsPDF = async () => {
  const slug = getMangaSlug();
  const formattedSlug = slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("-");
  const url = `../manga/${slug}/${formattedSlug}-Chapter-${currentChapter}.pdf`;

  const link = document.createElement("a");
  link.href = url;
  link.download = `${formattedSlug}-Chapter-${currentChapter}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/* ================================================
   Search Setup
   ================================================ */
const setupSearch = () => {
  const searchBar = document.getElementById("searchBar");
  if (!searchBar) return;

  searchBar.addEventListener("input", function () {
    const query = this.value.toLowerCase();
    const books = document.querySelectorAll(".book");
    let visibleCount = 0;

    books.forEach((book) => {
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
        </div>`;
      mangaSection.appendChild(placeholder);
    }
  } else if (placeholder) {
    placeholder.remove();
  }
};

/* ================================================
   Responsive Book Header Layout
   ================================================ */
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
  const threshold = 0.5;

  if (effectiveAspectRatio < threshold) {
    bookHeader.classList.add("stretched");
  } else {
    bookHeader.classList.remove("stretched");
  }
};

/* ================================================
   DOMContentLoaded Setup
   ================================================ */
document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme") || "light";
  applyTheme(savedTheme);

  const toggleButton = document.getElementById("toggleButton");
  if (toggleButton) {
    toggleButton.classList.toggle("dark", savedTheme === "dark");
    toggleButton.addEventListener("click", () => {
      toggleTheme();
      toggleButton.classList.toggle("dark");
    });
  }

  const chapterSelect = document.getElementById("chapterSelect");
  const urlParams = new URLSearchParams(window.location.search);
  const urlChapter = urlParams.get("chapter");
  const savedChapter = localStorage.getItem(getStorageKey());

  if (urlChapter) {
    currentChapter = parseInt(urlChapter, 10);
    localStorage.setItem(getStorageKey(), currentChapter);
  } else if (savedChapter) {
    currentChapter = parseInt(savedChapter, 10);
  } else if (chapterSelect) {
    currentChapter = parseInt(chapterSelect.value, 10);
  }

  loadChapter(currentChapter);

  if (chapterSelect) {
    chapterSelect.addEventListener("change", function () {
      loadChapter(this.value, true);
    });
  }

  document.querySelectorAll(".dropdown-content a[data-chapter]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const chapter = link.getAttribute("data-chapter");
      loadChapter(chapter, true);
      if (chapterSelect) chapterSelect.value = chapter;
    });
  });

  const downloadBtn = document.getElementById("downloadPdfBtn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadChapterAsPDF);
  }

  const prevBtn = document.getElementById("prevChapterBtn");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentChapter > 1) loadChapter(currentChapter - 1, true);
    });
  }

  const nextBtn = document.getElementById("nextChapterBtn");
  if (nextBtn) {
    nextBtn.addEventListener("click", async () => {
      if (await checkChapterExists(currentChapter + 1)) {
        loadChapter(currentChapter + 1, true);
      }
    });
  }

  setupSearch();
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
  const currentY = window.scrollY;
  if (currentY > scrollThreshold) {
    header.style.transform = currentY > lastScrollY ? "translateY(-100%)" : "translateY(0)";
  } else {
    header.style.transform = "translateY(0)";
  }
  lastScrollY = currentY;
});
