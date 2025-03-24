/* Global Variables */
let loadedPanels = [];
let currentChapter = 1; // Starting chapter

/* Helper Functions */
// Generate a slug from the manga title (assumes an element with id "manga-id" exists)
function getMangaSlug() {
  const titleElem = document.getElementById("manga-id");
  const title = titleElem ? titleElem.textContent : "";
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
}

// Construct the base path for a given chapter using the manga slug
function getBasePath(chapter) {
  const slug = getMangaSlug();
  return `../manga/${slug}/chapter-${chapter}/`;
}

/* Theme Functions */
function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
}

function toggleTheme() {
  const currentTheme = document.body.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(newTheme);
}

/* Chapter Existence Check */
async function checkChapterExists(chapterNumber) {
  const basePath = getBasePath(chapterNumber);
  const mangaSlug = getMangaSlug();
  const testImg = new Image();
  testImg.src = `${basePath}${mangaSlug}-1.webp`;
  return new Promise((resolve) => {
    testImg.onload = () => resolve(true);
    testImg.onerror = () => resolve(false);
  });
}

/* Navigation Button Update */
async function updateChapterButtons(chapter) {
  const prevBtn = document.getElementById("prevChapterBtn");
  const nextBtn = document.getElementById("nextChapterBtn");
  if (prevBtn) {
    prevBtn.style.display = chapter <= 1 ? "none" : "inline-flex";
  }
  if (nextBtn) {
    const exists = await checkChapterExists(chapter + 1);
    nextBtn.style.display = exists ? "inline-flex" : "none";
  }
}

/* Load Manga Chapter Panels with Batched Concurrent Loading */
async function loadChapter(chapterNumber, scroll = false) {
  currentChapter = Number(chapterNumber);
  localStorage.setItem("lastChapter", currentChapter);

  const chapterSelect = document.getElementById("chapterSelect");
  if (chapterSelect) {
    chapterSelect.value = currentChapter;
  }

  if (scroll) {
    window.scrollTo({
      top: document.getElementById("chapterSelect").offsetTop,
      behavior: "smooth",
    });
  }

  await updateChapterButtons(currentChapter);

  const mangaSlug = getMangaSlug();
  const basePath = getBasePath(currentChapter);
  const chapterContentDiv = document.getElementById("chapter-content");
  chapterContentDiv.innerHTML = "";
  loadedPanels = [];

  let panelNumber = 1;
  const batchSize = 5;
  while (true) {
    const batchPromises = [];
    for (let i = 0; i < batchSize; i++) {
      const currentPanel = panelNumber + i;
      const img = new Image();
      img.src = `${basePath}${mangaSlug}-${currentPanel}.webp`;
      img.alt = `Panel ${currentPanel}`;
      img.style.width = "100%";
      img.style.display = "block";
      img.style.marginBottom = "20px";
      batchPromises.push(
        new Promise((resolve) => {
          img.onload = () => resolve({ success: true, image: img });
          img.onerror = () => resolve({ success: false, image: null });
        })
      );
    }
    const results = await Promise.all(batchPromises);
    let batchHasError = false;
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
        chapterContentDiv.innerHTML =
          "<p>No panels found for this chapter.</p>";
      }
      break;
    }
  }

  // New Block: Append final image from root/images when all panels are loaded.
  const finalImg = new Image();
  // Adjust the image filename as needed.
  finalImg.src = "../images/otaku-manga-ads.jpg";
  finalImg.alt = "End of Chapter";
  finalImg.style.width = "100%";
  finalImg.style.display = "block";
  finalImg.style.marginBottom = "20px";
  chapterContentDiv.appendChild(finalImg);

  await updateChapterButtons(currentChapter);
}

/* Download Chapter as PDF */
async function downloadChapterAsPDF() {
  const mangaSlug = getMangaSlug();
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
}

/* Search Functionality */
// Set up the search to filter manga titles and display a placeholder if none match.
function setupSearch() {
  const searchBar = document.getElementById("searchBar");
  if (searchBar) {
    searchBar.addEventListener("input", function () {
      const query = this.value.toLowerCase();
      const books = document.querySelectorAll(".book");
      let visibleCount = 0;

      books.forEach((book) => {
        // Skip placeholder card in filtering
        if (book.id === "noResultsPlaceholder") return;
        const title = book.querySelector(".info h3").textContent.toLowerCase();
        if (title.includes(query)) {
          book.style.display = "inline-block";
          visibleCount++;
        } else {
          book.style.display = "none";
        }
      });

      updatePlaceholder(visibleCount);
    });
  }
}

// Check if no manga cards are visible and add/remove a placeholder card accordingly.
function updatePlaceholder(visibleCount) {
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
}

/* Event Listeners Setup */
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
  document
    .querySelectorAll(".dropdown-content a[data-chapter]")
    .forEach((link) => {
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

  const savedChapter = localStorage.getItem("lastChapter");
  loadChapter(
    chapterSelect ? savedChapter || chapterSelect.value : savedChapter || 1
  );

  // Initialize search functionality
  setupSearch();
});

/* Header Hide on Scroll */
let lastScrollY = window.scrollY;
const header = document.getElementById("site-header");
const scrollThreshold = 100;

window.addEventListener("scroll", () => {
  const currentScrollY = window.scrollY;
  if (currentScrollY > scrollThreshold) {
    header.style.transform =
      currentScrollY > lastScrollY ? "translateY(-100%)" : "translateY(0)";
  } else {
    header.style.transform = "translateY(0)";
  }
  lastScrollY = currentScrollY;
});
