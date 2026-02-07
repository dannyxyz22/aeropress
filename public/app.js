const form = document.getElementById("compress-form");
const fileInput = document.getElementById("file-input");
const presetSelect = document.getElementById("preset");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const sizesEl = document.getElementById("sizes");
const downloadLink = document.getElementById("download-link");
const submitBtn = document.getElementById("submit-btn");
const dropZone = document.getElementById("drop-zone");
const fileNameEl = document.getElementById("file-name");

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(1)} ${units[idx]}`;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = `status ${isError ? "error" : ""}`;
}

function updateFileName() {
  const file = fileInput.files[0];
  fileNameEl.textContent = file ? file.name : "";
}

fileInput.addEventListener("change", updateFileName);

if (dropZone) {
  dropZone.addEventListener("click", (e) => {
    if (e.target === fileInput) return;
    fileInput.click();
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("dragover");
    const files = e.dataTransfer?.files;
    if (files?.length && files[0].type === "application/pdf") {
      fileInput.files = files;
      updateFileName();
    }
  });

  dropZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = fileInput.files[0];
  if (!file) {
    setStatus("Selecione um arquivo PDF.", true);
    return;
  }

  resultEl.classList.add("hidden");
  setStatus("Compactando...");
  submitBtn.disabled = true;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("preset", presetSelect.value);

  try {
    const response = await fetch("/api/compress", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await response.json();
        throw new Error(data.error || "Falha na compressão.");
      }
      throw new Error("Falha na compressão.");
    }

    const originalSize = Number(response.headers.get("X-Original-Size"));
    const compressedSize = Number(response.headers.get("X-Compressed-Size"));
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    downloadLink.href = url;
    sizesEl.textContent = `Original: ${formatBytes(originalSize)} → Compactado: ${formatBytes(compressedSize)}`;
    resultEl.classList.remove("hidden");
    setStatus("Pronto!");
  } catch (error) {
    setStatus(error.message || "Falha na compressão.", true);
  } finally {
    submitBtn.disabled = false;
  }
});
