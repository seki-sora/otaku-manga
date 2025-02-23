/* Global Variables */
let loadedPanels = [];
let currentChapter = 1; // Starting chapter

/* Helper Functions */
// Generate a slug from the manga title (assumes #manga-title exists)
function getMangaSlug() {
  const titleElem = document.getElementById("manga-title");
  const title = titleElem ? titleElem.textContent : "";
  return title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
}

// Generate the base path for the current chapter
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

/* Check if a Chapter Exists by testing the first panel image */
async function checkChapterExists(chapterNumber) {
  const basePath = getBasePath(chapterNumber);
  const mangaSlug = getMangaSlug();
  const testImg = new Image();
  testImg.src = `${basePath}${mangaSlug}-1.webp`; // testing first panel
  return new Promise((resolve) => {
    testImg.onload = () => resolve(true);
    testImg.onerror = () => resolve(false);
  });
}

/* Update Navigation Button Visibility Dynamically */
async function updateChapterButtons(chapter) {
  const prevBtn = document.getElementById("prevChapterBtn");
  const nextBtn = document.getElementById("nextChapterBtn");

  // Hide previous button on first chapter
  if (prevBtn) {
    prevBtn.style.display = chapter <= 1 ? "none" : "inline-flex";
  }

  // Check if the next chapter exists and update the button accordingly
  if (nextBtn) {
    const exists = await checkChapterExists(chapter + 1);
    nextBtn.style.display = exists ? "inline-flex" : "none";
  }
}

/* Load Manga Chapter Panels with Batched Concurrent Loading */
async function loadChapter(chapterNumber) {
  currentChapter = Number(chapterNumber);
  localStorage.setItem("lastChapter", currentChapter);

  // Update chapter selection dropdown if present
  const chapterSelect = document.getElementById("chapterSelect");
  if (chapterSelect) {
    chapterSelect.value = currentChapter;
  }

  // Update navigation buttons
  await updateChapterButtons(currentChapter);

  const mangaSlug = getMangaSlug();
  const basePath = getBasePath(currentChapter);
  const chapterContentDiv = document.getElementById("chapter-content");
  chapterContentDiv.innerHTML = "";
  loadedPanels = [];

  let panelNumber = 1;
  const batchSize = 5; // Adjust batch size per your network/server capabilities

  // Load images in batches until one fails
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
    for (let result of results) {
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

  // Refresh navigation buttons after chapter load
  await updateChapterButtons(currentChapter);
}

/* Download Chapter as PDF by Guessing Image Sequence */
async function downloadChapterAsPDF() {
  const mangaSlug = getMangaSlug();
  const basePath = getBasePath(currentChapter);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  let panelNumber = 1;
  const foundImages = [];

  // Load images sequentially until one fails
  while (true) {
    const imgSrc = `${basePath}${mangaSlug}-${panelNumber}.webp`;
    const img = new Image();
    img.src = imgSrc;

    const exists = await new Promise((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
    });

    if (!exists) break;
    foundImages.push(img);
    panelNumber++;
  }

  if (foundImages.length === 0) {
    alert("No panels found for this chapter.");
    return;
  }

  // Add each image as a page in the PDF
  for (let i = 0; i < foundImages.length; i++) {
    const img = foundImages[i];
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    const imgData = canvas.toDataURL("image/jpeg", 1.0);
    let imgWidth = pageWidth;
    let imgHeight = (canvas.height * pageWidth) / canvas.width;
    if (imgHeight > pageHeight) {
      imgHeight = pageHeight;
      imgWidth = (canvas.width * pageHeight) / canvas.height;
    }
    pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
    if (i < foundImages.length - 1) {
      pdf.addPage();
    }
  }

  const formattedSlug = mangaSlug
  .split("-") // Split by hyphen
  .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize first letter
  .join("-"); // Join without spaces

  pdf.save(`${formattedSlug}-Chapter-${currentChapter}.pdf`);
}

/* Event Listeners Setup */
document.addEventListener("DOMContentLoaded", () => {
  // Initialize theme from saved setting
  const savedTheme = localStorage.getItem("theme") || "light";
  applyTheme(savedTheme);

  // Toggle theme button listener
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
      loadChapter(this.value);
    });
  }

  // Dropdown chapter links listener (for mobile or alternative navigation)
  document
    .querySelectorAll(".dropdown-content a[data-chapter]")
    .forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const chapter = link.getAttribute("data-chapter");
        loadChapter(chapter);
        if (chapterSelect) chapterSelect.value = chapter;
      });
    });

  // Download PDF button listener
  const downloadBtn = document.getElementById("downloadPdfBtn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadChapterAsPDF);
  }

  // Navigation buttons listeners
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

  // Load the last-read chapter (if available) or default chapter 1
  const savedChapter = localStorage.getItem("lastChapter");
  loadChapter(
    chapterSelect ? savedChapter || chapterSelect.value : savedChapter || 1
  );
});
