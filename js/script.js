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
    document.querySelectorAll(".dropdown-content a[data-chapter]").forEach(link => {
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
function loadChapter(chapterNumber) {
    const mangaTitle = document.getElementById("manga-title").textContent;
    const chapterContentDiv = document.getElementById("chapter-content");
    chapterContentDiv.innerHTML = ""; // Clear previous content

    // Convert the manga title to a URL-friendly slug
    const mangaSlug = mangaTitle.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");

    // Build the base path: e.g., "../manga/when-rain-meets-tears/1/"
    const basePath = `../manga/${mangaSlug}/chapter-${chapterNumber}/`;
    let panelNumber = 1;

    function loadNextPanel() {
      const img = new Image();
      // Build filename with WebP extension, e.g., "when-rain-meets-tears-panel-1.webp"
      img.src = `${basePath}${mangaSlug}-${panelNumber}.webp`;
      img.alt = `Panel ${panelNumber}`;
      img.style.width = "100%";
      img.style.display = "block";
      img.style.marginBottom = "20px";

      img.onload = () => {
        chapterContentDiv.appendChild(img);
        panelNumber++;
        loadNextPanel(); // Try loading the next panel
      };

      img.onerror = () => {
        if (panelNumber === 1) {
          chapterContentDiv.innerHTML = "<p>No panels found for this chapter.</p>";
        }
        // Stop trying when a panel fails to load.
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
    // Ensure jsPDF is available
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: 'a4'
    });

    const chapterContentDiv = document.getElementById("chapter-content");
    const images = chapterContentDiv.querySelectorAll("img");

    if (images.length === 0) {
      alert("No panels found for this chapter.");
      return;
    }

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Process each image in the chapter
    for (let i = 0; i < images.length; i++) {
      const img = images[i];

      // Ensure the image is loaded (should be already, but just in case)
      await new Promise(resolve => {
        if (img.complete) resolve();
        else img.onload = resolve;
      });

      // Draw image into a canvas to convert WebP to a supported format (JPEG)
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      context.drawImage(img, 0, 0);

      // Convert the canvas content to a JPEG data URL
      const imgData = canvas.toDataURL("image/jpeg", 1.0);

      // Calculate dimensions to fit the PDF page
      let imgWidth = pageWidth;
      let imgHeight = (canvas.height * pageWidth) / canvas.width;
      if (imgHeight > pageHeight) {
        imgHeight = pageHeight;
        imgWidth = (canvas.width * pageHeight) / canvas.height;
      }

      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);

      // Add a new page if this is not the last image
      if (i < images.length - 1) {
        pdf.addPage();
      }
    }

    // Generate a filename using the manga title and chapter number
    const chapterSelect = document.getElementById("chapterSelect");
    const chapterValue = chapterSelect ? chapterSelect.value : "chapter";
    const mangaTitle = document.getElementById("manga-title").textContent.replace(/\s+/g, '-');
    pdf.save(`${mangaTitle}-Chapter-${chapterValue}.pdf`);
  }
