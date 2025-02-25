/* Global Variables */
let loadedPanels = [];
let currentChapter = 1; // Starting chapter

/* Helper Functions */
// Generate a slug from the manga title (assumes an element with id "manga-title" exists)
function getMangaSlug() {
  const titleElem = document.getElementById("manga-id");
  const title = titleElem ? titleElem.textContent : "";
  // Use only the portion of the title before a comma, semicolon, or colon
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
// Apply the selected theme and persist the setting
function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
}

// Toggle between dark and light themes
function toggleTheme() {
  const currentTheme = document.body.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(newTheme);
}

/* Chapter Existence Check */
// Check if a chapter exists by testing if the first panel image loads
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
// Update the visibility of the previous and next chapter buttons
async function updateChapterButtons(chapter) {
  const prevBtn = document.getElementById("prevChapterBtn");
  const nextBtn = document.getElementById("nextChapterBtn");

  // Hide the previous button on the first chapter
  if (prevBtn) {
    prevBtn.style.display = chapter <= 1 ? "none" : "inline-flex";
  }

  // Check if the next chapter exists and update the next button accordingly
  if (nextBtn) {
    const exists = await checkChapterExists(chapter + 1);
    nextBtn.style.display = exists ? "inline-flex" : "none";
  }
}

/* Load Manga Chapter Panels with Batched Concurrent Loading */
async function loadChapter(chapterNumber) {
  currentChapter = Number(chapterNumber);
  localStorage.setItem("lastChapter", currentChapter);

  // Update chapter selection dropdown if available
  const chapterSelect = document.getElementById("chapterSelect");
  if (chapterSelect) {
    chapterSelect.value = currentChapter;
  }

  // Scroll to the chapter selector smoothly
  window.scrollTo({ top: document.getElementById("chapterSelect").offsetTop, behavior: "smooth" });

  // Update navigation buttons for the current chapter
  await updateChapterButtons(currentChapter);

  const mangaSlug = getMangaSlug();
  const basePath = getBasePath(currentChapter);
  const chapterContentDiv = document.getElementById("chapter-content");
  chapterContentDiv.innerHTML = "";
  loadedPanels = [];

  let panelNumber = 1;
  const batchSize = 5; // Batch size can be adjusted based on network/server performance

  while (true) {
    const batchPromises = [];

    // Prepare a batch of image loading promises
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

    // Await all images in the current batch
    const results = await Promise.all(batchPromises);
    let batchHasError = false;

    // Process each result in the batch
    for (const result of results) {
      if (!result.success) {
        batchHasError = true;
        break;
      }
      chapterContentDiv.appendChild(result.image);
      loadedPanels.push(result.image);
      panelNumber++;
    }

    // If any image in the batch failed to load, stop the loading process
    if (batchHasError) {
      if (loadedPanels.length === 0) {
        chapterContentDiv.innerHTML = "<p>No panels found for this chapter.</p>";
      }
      break;
    }
  }

  // Update navigation buttons after loading the chapter
  await updateChapterButtons(currentChapter);
}

/* Download Chapter as PDF */
// Constructs a PDF URL based on a naming convention and triggers the download
async function downloadChapterAsPDF() {
  const mangaSlug = getMangaSlug();
  // Format the slug to have each word's first letter in uppercase
  const formattedSlug = mangaSlug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("-");
  const pdfUrl = `../manga/${mangaSlug}/${formattedSlug}-Chapter-${currentChapter}.pdf`;

  // Create a temporary link to initiate the PDF download
  const link = document.createElement("a");
  link.href = pdfUrl;
  link.download = `${formattedSlug}-Chapter-${currentChapter}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* Event Listeners Setup */
document.addEventListener("DOMContentLoaded", () => {
  // Initialize theme based on saved settings or default to light
  const savedTheme = localStorage.getItem("theme") || "light";
  applyTheme(savedTheme);

  // Setup theme toggle button, if available
  const toggleButton = document.getElementById("toggleButton");
  if (toggleButton) {
    toggleButton.classList.toggle("dark", savedTheme === "dark");
    toggleButton.addEventListener("click", () => {
      toggleTheme();
      toggleButton.classList.toggle("dark");
    });
  }

  // Setup chapter selection dropdown listener, if available
  const chapterSelect = document.getElementById("chapterSelect");
  if (chapterSelect) {
    chapterSelect.addEventListener("change", function () {
      loadChapter(this.value);
    });
  }

  // Setup dropdown chapter links for mobile or alternative navigation
  document.querySelectorAll(".dropdown-content a[data-chapter]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const chapter = link.getAttribute("data-chapter");
      loadChapter(chapter);
      if (chapterSelect) chapterSelect.value = chapter;
    });
  });

  // Setup PDF download button listener, if available
  const downloadBtn = document.getElementById("downloadPdfBtn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadChapterAsPDF);
  }

  // Setup previous and next chapter buttons listeners, if available
  const prevBtn = document.getElementById("prevChapterBtn");
  const nextBtn = document.getElementById("nextChapterBtn");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentChapter > 1) loadChapter(currentChapter - 1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", async () => {
      if (await checkChapterExists(currentChapter + 1)) {
        loadChapter(currentChapter + 1);
      }
    });
  }

  // Load the last-read chapter from localStorage or default to chapter 1
  const savedChapter = localStorage.getItem("lastChapter");
  loadChapter(chapterSelect ? savedChapter || chapterSelect.value : savedChapter || 1);
});
