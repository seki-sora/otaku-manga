/* Global Variables */
let loadedPanels = [];
let currentChapter = 1; // Starting chapter

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
  const mangaTitleElem = document.getElementById("manga-title");
  const mangaTitle = mangaTitleElem ? mangaTitleElem.textContent : "";
  const mangaSlug = mangaTitle
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
  const basePath = `../manga/${mangaSlug}/chapter-${chapterNumber}/`;
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

  // Dynamically check if next chapter exists
  if (nextBtn) {
    const exists = await checkChapterExists(chapter + 1);
    nextBtn.style.display = exists ? "inline-flex" : "none";
  }
}

/* Load Manga Chapter Panels (Optimized with Preloading and Concurrent Loading) */
async function loadChapter(chapterNumber) {
  currentChapter = Number(chapterNumber);
  // Store the current chapter so that it can be reloaded later
  localStorage.setItem("lastChapter", currentChapter);

  const chapterSelect = document.getElementById("chapterSelect");
  if (chapterSelect) {
    chapterSelect.value = currentChapter;
  }

  // Update navigation buttons (which now update dynamically)
  await updateChapterButtons(currentChapter);

  const mangaTitleElem = document.getElementById("manga-title");
  const mangaTitle = mangaTitleElem ? mangaTitleElem.textContent : "";
  const chapterContentDiv = document.getElementById("chapter-content");
  chapterContentDiv.innerHTML = "";
  loadedPanels = [];

  // Convert title to a slug for URL path
  const mangaSlug = mangaTitle
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
  const basePath = `../manga/${mangaSlug}/chapter-${currentChapter}/`;

  let panelNumber = 1;
  const batchSize = 5; // Adjust based on your server/network capability

  // Load images in batches concurrently until one fails
  while (true) {
    const batchPromises = [];
    for (let i = 0; i < batchSize; i++) {
      const currentPanel = panelNumber + i;
      const img = new Image();
      img.src = `${basePath}${mangaSlug}-${currentPanel}.webp`;
      console.log(img.src);
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
    let encounteredError = false;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (!result.success) {
        encounteredError = true;
        break;
      }
      chapterContentDiv.appendChild(result.image);
      loadedPanels.push(result.image);
      panelNumber++;
    }
    if (encounteredError) {
      if (loadedPanels.length === 0) {
        chapterContentDiv.innerHTML =
          "<p>No panels found for this chapter.</p>";
      }
      break;
    }
  }

  // After loading, update the chapter buttons to reflect the next chapter's availability
  await updateChapterButtons(currentChapter);
}

/* Download Chapter as PDF */
async function downloadChapterAsPDF() {
  if (loadedPanels.length === 0) {
    alert("No panels found for this chapter.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "px",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Retrieve the manga title element to generate the PDF filename
  const mangaTitleElem = document.getElementById("manga-title");

  // Loop through each loaded panel and add it to the PDF
  for (let i = 0; i < loadedPanels.length; i++) {
    const img = loadedPanels[i];

    // Wait until the image is fully loaded before processing
    await new Promise((resolve) => {
      if (img.complete) resolve();
      else img.onload = resolve;
    });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    context.drawImage(img, 0, 0);

    // Convert the canvas content to a JPEG data URL
    const imgData = canvas.toDataURL("image/jpeg", 1.0);

    // Calculate image dimensions while maintaining aspect ratio
    let imgWidth = pageWidth;
    let imgHeight = (canvas.height * pageWidth) / canvas.width;
    if (imgHeight > pageHeight) {
      imgHeight = pageHeight;
      imgWidth = (canvas.width * pageHeight) / canvas.height;
    }
    pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);

    // Add a new page if this is not the last panel
    if (i < loadedPanels.length - 1) {
      pdf.addPage();
    }
  }

  // Generate a slug for the PDF file name based on the manga title
  const mangaTitleSlug = mangaTitleElem
    ? mangaTitleElem.textContent.replace(/\s+/g, "-")
    : "Manga";
  pdf.save(`${mangaTitleSlug}-Chapter-${currentChapter}.pdf`);
}

/* Event Listeners Setup */
document.addEventListener("DOMContentLoaded", () => {
  // Initialize theme and toggle button
  const toggleButton = document.getElementById("toggleButton");
  const savedTheme = localStorage.getItem("theme") || "light";
  applyTheme(savedTheme);
  if (toggleButton) {
    if (savedTheme === "dark") {
      toggleButton.classList.add("dark");
    } else {
      toggleButton.classList.remove("dark");
    }
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

  // Dropdown chapter links listener
  document
    .querySelectorAll(".dropdown-content a[data-chapter]")
    .forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const chapter = link.getAttribute("data-chapter");
        loadChapter(chapter);
        if (chapterSelect) {
          chapterSelect.value = chapter;
        }
      });
    });

  // Download button listener
  const downloadBtn = document.getElementById("downloadPdfBtn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadChapterAsPDF);
  }

  // Navigation buttons listeners
  const prevBtn = document.getElementById("prevChapterBtn");
  const nextBtn = document.getElementById("nextChapterBtn");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentChapter > 1) {
        loadChapter(currentChapter - 1);
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", async () => {
      // Attempt to load the next chapter only if it exists
      const exists = await checkChapterExists(currentChapter + 1);
      if (exists) {
        loadChapter(currentChapter + 1);
      }
    });
  }

  // Load the last-read chapter if it exists; otherwise, load the default chapter.
  const savedChapter = localStorage.getItem("lastChapter");
  loadChapter(chapterSelect ? (savedChapter || chapterSelect.value) : savedChapter || 1);
});
