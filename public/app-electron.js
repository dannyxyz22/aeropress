/**
 * Frontend Electron — seleção de PDF via diálogo, compressão via IPC e abrir pasta.
 */
const form = document.getElementById("compress-form");
const selectPdfBtn = document.getElementById("select-pdf-btn");
const presetSelect = document.getElementById("preset");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const sizesEl = document.getElementById("sizes");
const openFolderBtn = document.getElementById("open-folder-btn");
const submitBtn = document.getElementById("submit-btn");
const fileNameEl = document.getElementById("file-name");

let selectedFile = null; // { path, name, size }

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

selectPdfBtn.addEventListener("click", async () => {
  const result = await window.electronAPI.selectPdf();
  if (!result) {
    setStatus("Nenhum arquivo selecionado.");
    selectedFile = null;
    fileNameEl.textContent = "Nenhum arquivo selecionado";
    return;
  }
  selectedFile = result;
  fileNameEl.textContent = `${result.name} (${formatBytes(result.size)})`;
  setStatus("");
  resultEl.classList.add("hidden");
});

window.electronAPI.onCompressProgress((percent) => {
  setStatus(`Compactando... ${percent}%`);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedFile) {
    setStatus("Selecione um arquivo PDF.", true);
    return;
  }

  resultEl.classList.add("hidden");
  submitBtn.disabled = true;
  setStatus("Compactando... 0%");

  try {
    const result = await window.electronAPI.compress(selectedFile.path, presetSelect.value);

    if (result.canceled) {
      setStatus("Salvamento cancelado.");
      return;
    }

    sizesEl.textContent =
      `Original: ${formatBytes(result.originalSize)} → Compactado: ${formatBytes(result.compressedSize)}`;
    resultEl.classList.remove("hidden");
    setStatus("Pronto! Arquivo salvo.");

    openFolderBtn.onclick = () => {
      window.electronAPI.showItemInFolder(result.savedPath);
    };
  } catch (err) {
    const msg = err?.message || "Erro ao compactar.";
    setStatus(msg, true);
  } finally {
    submitBtn.disabled = false;
  }
});
