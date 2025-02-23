// Function to apply theme remains unchanged
function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme); // Save theme to localStorage
}

// Function to toggle theme
function toggleTheme() {
  const currentTheme = document.body.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(newTheme);
}

// Function to apply a theme
function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
}

// Update toggle button class when toggling theme
document.getElementById("toggleButton").addEventListener("click", () => {
  toggleTheme();

  // Update toggle button state
  const toggleButton = document.getElementById("toggleButton");
  toggleButton.classList.toggle("dark");
});

// Set initial theme on page load
document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme") || "light"; // Default to light
  applyTheme(savedTheme);

  // Update toggle button state
  const toggleButton = document.getElementById("toggleButton");
  if (savedTheme === "dark") {
    toggleButton.classList.add("dark");
  } else {
    toggleButton.classList.remove("dark");
  }

  // Load default chapter if chapter selector exists
  const chapterSelect = document.getElementById("chapterSelect");
  if (chapterSelect) {
    loadChapter(chapterSelect.value);
    chapterSelect.addEventListener("change", function () {
      loadChapter(this.value);
    });
  }

  // Alternatively, if using chapter links in the header dropdown:
  document
    .querySelectorAll(".dropdown-content a[data-chapter]")
    .forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const chapter = link.getAttribute("data-chapter");
        loadChapter(chapter);
        // Optionally update the dropdown or select element to reflect the change
        if (chapterSelect) {
          chapterSelect.value = chapter;
        }
      });
    });
});

// Function to load manga chapter panels
let loadedPanels = []; // Store loaded panels globally

function loadChapter(chapterNumber) {
  const mangaTitle = document.getElementById("manga-title").textContent;
  const chapterContentDiv = document.getElementById("chapter-content");
  chapterContentDiv.innerHTML = ""; // Clear previous content
  loadedPanels = []; // Reset loaded panels

  const mangaSlug = mangaTitle
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");

  const basePath = `../manga/${mangaSlug}/chapter-${chapterNumber}/`;
  let panelNumber = 1;

  function loadNextPanel() {
    const img = new Image();
    img.src = `${basePath}${mangaSlug}-${panelNumber}.webp`;
    img.alt = `Panel ${panelNumber}`;
    img.style.width = "100%";
    img.style.display = "block";
    img.style.marginBottom = "20px";

    img.onload = () => {
      chapterContentDiv.appendChild(img);
      loadedPanels.push(img); // Store image in the array
      panelNumber++;
      loadNextPanel();
    };

    img.onerror = () => {
      if (panelNumber === 1) {
        chapterContentDiv.innerHTML =
          "<p>No panels found for this chapter.</p>";
      }
      // Stop trying to load more images.
    };
  }

  loadNextPanel();
}


document.addEventListener("DOMContentLoaded", () => {
  // Existing initialization code...

  // Add event listener for the download button if it exists
  const downloadBtn = document.getElementById("downloadPdfBtn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadChapterAsPDF);
  }
});

// Function to download the current chapter as a PDF
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

  for (let i = 0; i < loadedPanels.length; i++) {
    const img = loadedPanels[i];

    await new Promise((resolve) => {
      if (img.complete) resolve();
      else img.onload = resolve;
    });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    context.drawImage(img, 0, 0);

    const imgData = canvas.toDataURL("image/jpeg", 1.0);

    let imgWidth = pageWidth;
    let imgHeight = (canvas.height * pageWidth) / canvas.width;
    if (imgHeight > pageHeight) {
      imgHeight = pageHeight;
      imgWidth = (canvas.width * pageHeight) / canvas.height;
    }

    pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);

    if (i < loadedPanels.length - 1) {
      pdf.addPage();
    }
  }

  const chapterSelect = document.getElementById("chapterSelect");
  const chapterValue = chapterSelect ? chapterSelect.value : "chapter";
  const mangaTitle = document
    .getElementById("manga-title")
    .textContent.replace(/\s+/g, "-");
  pdf.save(`${mangaTitle}-Chapter-${chapterValue}.pdf`);
}

