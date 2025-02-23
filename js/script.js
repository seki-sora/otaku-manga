     /* Global Variables */
     let loadedPanels = [];
     let currentChapter = 1;
     const totalChapters = 5;

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

     /* Load Manga Chapter Panels */
     function loadChapter(chapterNumber) {
       currentChapter = Number(chapterNumber);
       const chapterSelect = document.getElementById("chapterSelect");
       if (chapterSelect) {
         chapterSelect.value = currentChapter;
       }
       updateChapterButtons(currentChapter);

       const mangaTitle = document.getElementById("manga-title").textContent;
       const chapterContentDiv = document.getElementById("chapter-content");
       chapterContentDiv.innerHTML = "";
       loadedPanels = [];

       const mangaSlug = mangaTitle
         .toLowerCase()
         .replace(/\s+/g, "-")
         .replace(/[^a-z0-9\-]/g, "");
       const basePath = `../manga/${mangaSlug}/chapter-${currentChapter}/`;
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
           loadedPanels.push(img);
           panelNumber++;
           loadNextPanel();
         };

         img.onerror = () => {
           if (panelNumber === 1) {
             chapterContentDiv.innerHTML =
               "<p>No panels found for this chapter.</p>";
           }
           // Stop loading further panels if an image fails to load.
         };
       }
       loadNextPanel();
     }

     /* Update Navigation Button Visibility */
     function updateChapterButtons(chapter) {
       const prevBtn = document.getElementById("prevChapterBtn");
       const nextBtn = document.getElementById("nextChapterBtn");

       prevBtn.style.display = chapter <= 1 ? "none" : "inline-flex";
       nextBtn.style.display =
         chapter >= totalChapters ? "none" : "inline-flex";
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
         format: "a4"
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
       const mangaTitleSlug = document
         .getElementById("manga-title")
         .textContent.replace(/\s+/g, "-");
       pdf.save(`${mangaTitleSlug}-Chapter-${currentChapter}.pdf`);
     }

     /* Event Listeners Setup */
     document.addEventListener("DOMContentLoaded", () => {
       // Initialize theme and toggle button
       const toggleButton = document.getElementById("toggleButton");
       const savedTheme = localStorage.getItem("theme") || "light";
       applyTheme(savedTheme);
       if (savedTheme === "dark") {
         toggleButton.classList.add("dark");
       } else {
         toggleButton.classList.remove("dark");
       }
       toggleButton.addEventListener("click", () => {
         toggleTheme();
         toggleButton.classList.toggle("dark");
       });

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
       prevBtn.addEventListener("click", () => {
         if (currentChapter > 1) {
           loadChapter(currentChapter - 1);
         }
       });
       nextBtn.addEventListener("click", () => {
         if (currentChapter < totalChapters) {
           loadChapter(currentChapter + 1);
         }
       });

       // Load default chapter
       loadChapter(chapterSelect ? chapterSelect.value : 1);
     });