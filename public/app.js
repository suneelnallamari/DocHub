// DOM Elements
const uploadForm = document.getElementById("uploadForm");
const uploadBtn = document.getElementById("uploadBtn");
const uploadStatus = document.getElementById("uploadStatus");
const fileInput = document.getElementById("pdf");
const fileText = document.getElementById("fileText");
const fileDrop = document.getElementById("fileDrop");
const documentList = document.getElementById("documentList");
const searchInput = document.getElementById("searchInput");
const toast = document.getElementById("toast");
const deleteModal = document.getElementById("deleteModal");
const deleteMessage = document.getElementById("deleteMessage");
const confirmDelete = document.getElementById("confirmDelete");
const cancelDelete = document.getElementById("cancelDelete");
const modalClose = document.getElementById("modalClose");
const navLinks = document.getElementById("navLinks");
const menuBtn = document.getElementById("menuBtn");
const themeToggle = document.getElementById("themeToggle");
const themeLabel = document.getElementById("themeLabel");

let currentFilter = document.body.dataset.category || "all";
let searchQuery = "";
let documents = [];
let documentToDelete = null;

const categoryNames = {
  "cv-ml": "CV & ML",
  ssp: "SSP",
  fsd: "FSD"
};

// ==========================================================================
// THEME SWITCHER (DARK & LIGHT)
// ==========================================================================
function getInitialTheme() {
  const saved = localStorage.getItem("doc_hub_theme");
  if (saved === "dark" || saved === "light") {
    return saved;
  }
  // Default to dark (signature ChatGPT aesthetic)
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("doc_hub_theme", theme);
  if (themeLabel) {
    themeLabel.textContent = theme === "dark" ? "Dark" : "Light";
  }
  if (themeToggle) {
    themeToggle.setAttribute(
      "aria-label",
      `Switch to ${theme === "dark" ? "light" : "dark"} mode`
    );
  }
}

// Initial theme apply
setTheme(getInitialTheme());

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  });
}

// Listen for OS theme preference changes if user hasn't explicitly set a choice
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
  if (!localStorage.getItem("doc_hub_theme")) {
    setTheme(e.matches ? "dark" : "light");
  }
});

// ==========================================================================
// UTILITY FUNCTIONS
// ==========================================================================
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(iso) {
  const date = new Date(iso);
  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

function setStatus(message, type = "") {
  if (!uploadStatus) return;
  uploadStatus.textContent = message;
  uploadStatus.className = `status ${type}`;
}

// ==========================================================================
// UPLOAD FORM INTERACTION
// ==========================================================================
document.querySelectorAll('input[name="category"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    document.querySelectorAll(".toggle-option").forEach((option) => {
      option.classList.toggle(
        "active",
        option.querySelector("input").checked
      );
    });
  });
});

function handleFileSelected(file) {
  if (!file) return;
  if (fileText) {
    fileText.textContent = file.name;
  }
  const nameInput = document.getElementById("docName");
  if (nameInput && !nameInput.value.trim()) {
    const cleanName = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
    nameInput.value = cleanName;
  }
}

if (fileInput) {
  fileInput.addEventListener("change", () => {
    handleFileSelected(fileInput.files[0]);
  });
}

if (fileDrop) {
  ["dragenter", "dragover"].forEach((eventName) => {
    fileDrop.addEventListener(eventName, (e) => {
      e.preventDefault();
      fileDrop.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    fileDrop.addEventListener(eventName, (e) => {
      e.preventDefault();
      fileDrop.classList.remove("dragging");
    });
  });

  fileDrop.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      showToast("Only PDF files are allowed.");
      return;
    }

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    handleFileSelected(file);
  });
}

// Preselect category from URL query param if present (e.g. upload.html?category=ssp)
const urlParams = new URLSearchParams(window.location.search);
const preselectedCategory = urlParams.get("category");
if (preselectedCategory && categoryNames[preselectedCategory]) {
  const radio = document.querySelector(`input[name="category"][value="${preselectedCategory}"]`);
  if (radio) {
    radio.checked = true;
    document.querySelectorAll(".toggle-option").forEach((option) => {
      option.classList.toggle("active", option.querySelector("input")?.value === preselectedCategory);
    });
  }
}

if (uploadForm) {
  uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nameInput = document.getElementById("docName");
    let name = nameInput ? nameInput.value.trim() : "";
    const category = document.querySelector('input[name="category"]:checked')?.value || "cv-ml";
    const file = fileInput.files[0];

    if (!file) return setStatus("Please choose a PDF file.", "error");

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      return setStatus("Only PDF files are allowed.", "error");
    }

    if (file.size > 20 * 1024 * 1024) {
      return setStatus("PDF must be 20 MB or smaller.", "error");
    }

    if (!name) {
      name = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "Document";
      if (nameInput) nameInput.value = name;
    }

    const formData = new FormData(uploadForm);
    // Ensure name is present in FormData
    if (!formData.get("name")) {
      formData.set("name", name);
    }
    if (!formData.get("category")) {
      formData.set("category", category);
    }

    uploadBtn.disabled = true;
    const originalText = uploadBtn.innerHTML;
    uploadBtn.innerHTML = `<span>Uploading...</span>`;
    setStatus("Uploading your PDF...");

    try {
      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      uploadForm.reset();
      const firstRadio = document.querySelector('input[name="category"][value="cv-ml"]');
      if (firstRadio) firstRadio.checked = true;
      document.querySelectorAll(".toggle-option").forEach((option, index) => {
        option.classList.toggle("active", index === 0);
      });
      if (fileText) {
        fileText.textContent = "Choose a PDF file or drag & drop";
      }

      setStatus("PDF uploaded successfully! Redirecting to documents...", "success");
      showToast("PDF uploaded successfully.");

      if (documentList) {
        await loadDocuments(currentFilter);
      } else {
        setTimeout(() => {
          window.location.href = `index.html#${category}`;
        }, 1200);
      }
    } catch (error) {
      setStatus(error.message, "error");
      showToast(error.message);
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = originalText;
    }
  });
}

// ==========================================================================
// SEARCH & FILTER
// ==========================================================================
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderDocuments();
  });
}

// ==========================================================================
// DOCUMENT FETCHING & RENDERING
// ==========================================================================
async function loadDocuments(filter = currentFilter) {
  try {
    const query = filter === "all" ? "" : `?category=${encodeURIComponent(filter)}`;
    const response = await fetch(`/api/documents${query}`);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Could not load documents.");

    documents = data;

    renderDocuments();
    renderCategoryPreviews();
  } catch (error) {
    if (documentList) {
      documentList.innerHTML = `<div class="empty">Could not load documents: ${escapeHtml(error.message)}</div>`;
    }
  }
}

function documentCard(doc) {
  return `
    <article class="document-card">
      <div class="pdf-icon-badge" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
      </div>
      <div class="doc-info">
        <div class="doc-title">${escapeHtml(doc.name)}</div>
        <div class="doc-meta">
          <span class="doc-tag">${escapeHtml(doc.category_name)}</span>
          <span>${escapeHtml(formatDate(doc.uploaded_at))}</span>
          <span>•</span>
          <span>${escapeHtml(doc.original_name)}</span>
        </div>
      </div>
      <div class="doc-actions">
        <a class="action-btn" href="${encodeURI(doc.url)}" target="_blank" rel="noopener">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          <span>Open</span>
        </a>
        <a class="action-btn" href="${encodeURI(doc.url)}" download>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Download</span>
        </a>
        <button class="action-btn delete" data-delete-id="${doc.id}" data-delete-name="${escapeHtml(doc.name)}" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          <span>Delete</span>
        </button>
      </div>
    </article>
  `;
}

function renderDocuments() {
  if (!documentList) return;

  let filtered = currentFilter === "all"
    ? documents
    : documents.filter((doc) => doc.category === currentFilter);

  if (searchQuery) {
    filtered = filtered.filter(
      (doc) =>
        doc.name.toLowerCase().includes(searchQuery) ||
        doc.original_name.toLowerCase().includes(searchQuery) ||
        doc.category_name.toLowerCase().includes(searchQuery)
    );
  }

  if (!filtered.length) {
    const emptyMsg = searchQuery
      ? `No documents matching "${escapeHtml(searchQuery)}".`
      : `No documents in ${currentFilter === "all" ? "your hub" : categoryNames[currentFilter]} yet.`;
    documentList.innerHTML = `<div class="empty">${emptyMsg}</div>`;
    return;
  }

  documentList.innerHTML = filtered.map(documentCard).join("");

  document.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", () => {
      openDeleteModal(
        Number(button.dataset.deleteId),
        button.dataset.deleteName
      );
    });
  });
}

function renderCategoryPreviews() {
  Object.keys(categoryNames).forEach((category) => {
    const container = document.getElementById(`${category}-preview`);
    if (!container) return;

    const categoryDocs = documents.filter((doc) => doc.category === category);

    if (!categoryDocs.length) {
      container.innerHTML = `<div class="empty">No ${categoryNames[category]} documents yet.</div>`;
      return;
    }

    container.innerHTML = categoryDocs
      .slice(0, 6)
      .map(
        (doc) => `
          <a class="preview-card" href="${encodeURI(doc.url)}" target="_blank" rel="noopener">
            <div class="pdf-icon-badge" style="width:34px;height:34px;" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
            </div>
            <div class="preview-card-info">
              <div class="preview-card-title">${escapeHtml(doc.name)}</div>
              <div class="preview-card-date">${escapeHtml(formatDate(doc.uploaded_at))}</div>
            </div>
          </a>
        `
      )
      .join("");
  });
}

// ==========================================================================
// DELETE MODAL
// ==========================================================================
function openDeleteModal(id, name) {
  documentToDelete = id;
  if (deleteMessage) {
    deleteMessage.textContent = `Are you sure you want to delete "${name}"? This action cannot be undone.`;
  }
  if (deleteModal) {
    deleteModal.classList.remove("hidden");
  }
}

function closeDeleteModal() {
  documentToDelete = null;
  if (deleteModal) {
    deleteModal.classList.add("hidden");
  }
}

if (confirmDelete) {
  confirmDelete.addEventListener("click", async () => {
    if (!documentToDelete) return;

    confirmDelete.disabled = true;
    confirmDelete.textContent = "Deleting...";

    try {
      const response = await fetch(`/api/documents/${documentToDelete}`, {
        method: "DELETE"
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Delete failed.");

      closeDeleteModal();
      showToast("PDF deleted successfully.");
      await loadDocuments(currentFilter);
    } catch (error) {
      showToast(error.message);
    } finally {
      confirmDelete.disabled = false;
      confirmDelete.textContent = "Delete";
    }
  });
}

if (cancelDelete) cancelDelete.addEventListener("click", closeDeleteModal);
if (modalClose) modalClose.addEventListener("click", closeDeleteModal);

if (deleteModal) {
  deleteModal.addEventListener("click", (e) => {
    if (e.target === deleteModal) closeDeleteModal();
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && deleteModal && !deleteModal.classList.contains("hidden")) {
    closeDeleteModal();
  }
});

// ==========================================================================
// TABS & QUICK LINKS
// ==========================================================================
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentFilter = tab.dataset.filter;
    loadDocuments(currentFilter);
  });
});

document.querySelectorAll("[data-category-link]").forEach((link) => {
  link.addEventListener("click", () => {
    const category = link.dataset.categoryLink;
    const radio = document.querySelector(
      `input[name="category"][value="${category}"]`
    );

    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event("change"));
    }

    const docName = document.getElementById("docName");
    if (docName) docName.focus();
  });
});

// Mobile menu toggle
if (menuBtn && navLinks) {
  menuBtn.addEventListener("click", () => navLinks.classList.toggle("open"));

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => navLinks.classList.remove("open"));
  });
}

// Initial load (only on pages with document list)
if (documentList) {
  loadDocuments();
}
