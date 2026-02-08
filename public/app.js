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

const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB
const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB por chunk

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

function showServerError(data, context = "") {
  const msg = data?.error || "Erro desconhecido no servidor.";
  const where = data?.where ? ` [servidor: ${data.where}]` : "";
  setStatus(context ? `${context} ${msg}${where}` : `${msg}${where}`, true);
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

  // Erro no cliente: arquivo maior que o limite
  if (file.size > MAX_FILE_SIZE) {
    setStatus(
      `Arquivo muito grande. Limite: 1 GB. Seu arquivo: ${formatBytes(file.size)}. [cliente: validação]`,
      true
    );
    return;
  }

  resultEl.classList.add("hidden");
  submitBtn.disabled = true;

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const preset = presetSelect.value;

  try {
    // --- init (servidor: init) ---
    setStatus("Preparando envio...");
    const initRes = await fetch("/api/compress/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        totalSize: file.size,
        totalChunks,
        preset,
      }),
    });

    const initData = await initRes.json().catch(() => ({}));
    if (!initRes.ok) {
      showServerError(initData, "Início do upload falhou.");
      return;
    }

    const { uploadId } = initData;
    if (!uploadId) {
      setStatus("Resposta inválida do servidor (uploadId ausente). [cliente: init]", true);
      return;
    }

    // --- chunks (servidor: chunk) ---
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const blob = file.slice(start, end);

      setStatus(`Enviando... ${Math.round(((i + 1) / totalChunks) * 100)}%`);

      const formData = new FormData();
      formData.append("uploadId", uploadId);
      formData.append("chunkIndex", String(i));
      formData.append("chunk", blob, "chunk");

      const chunkRes = await fetch("/api/compress/chunk", {
        method: "POST",
        body: formData,
      });

      const chunkData = await chunkRes.json().catch(() => ({}));
      if (!chunkRes.ok) {
        showServerError(
          chunkData,
          `Falha no envio do chunk ${i + 1} de ${totalChunks}.`
        );
        return;
      }
    }

    // --- finalize: inicia compressão e retorna jobId ---
    setStatus("Compactando... 0%");

    const finalizeRes = await fetch("/api/compress/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId }),
    });

    const finalizeData = await finalizeRes.json().catch(() => ({}));
    if (!finalizeRes.ok) {
      showServerError(
        finalizeData,
        finalizeData?.where === "ghostscript"
          ? "Falha na compactação (Ghostscript)."
          : "Falha ao finalizar upload."
      );
      return;
    }

    const { jobId } = finalizeData;
    if (!jobId) {
      setStatus("Resposta inválida do servidor (jobId ausente). [cliente: finalize]", true);
      return;
    }

    // --- poll status até done ou error ---
    const pollInterval = 400;
    let statusData = {};
    while (true) {
      const statusRes = await fetch(`/api/compress/status?jobId=${encodeURIComponent(jobId)}`);
      statusData = await statusRes.json().catch(() => ({}));
      if (!statusRes.ok) {
        showServerError(statusData, "Falha ao consultar status da compressão.");
        return;
      }
      const progress = statusData.progress ?? 0;
      setStatus(`Compactando... ${progress}%`);
      if (statusData.status === "done") break;
      if (statusData.status === "error") {
        setStatus(statusData.error || "Erro na compressão.", true);
        return;
      }
      await new Promise((r) => setTimeout(r, pollInterval));
    }

    // --- obter PDF ---
    const resultRes = await fetch(`/api/compress/result?jobId=${encodeURIComponent(jobId)}`);
    if (!resultRes.ok) {
      const resultData = await resultRes.json().catch(() => ({}));
      showServerError(resultData, "Falha ao obter o PDF compactado.");
      return;
    }

    const originalSize = Number(resultRes.headers.get("X-Original-Size"));
    const compressedSize = Number(resultRes.headers.get("X-Compressed-Size"));
    const blob = await resultRes.blob();
    const url = URL.createObjectURL(blob);

    downloadLink.href = url;
    sizesEl.textContent = `Original: ${formatBytes(originalSize)} → Compactado: ${formatBytes(compressedSize)}`;
    resultEl.classList.remove("hidden");
    setStatus("Pronto!");
  } catch (error) {
    // Erro de rede ou exceção no cliente
    const msg = error?.message || "";
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      setStatus("Conexão perdida durante o upload. Tente novamente. [cliente: rede]", true);
    } else {
      setStatus(`${msg || "Erro inesperado."} [cliente]`, true);
    }
  } finally {
    submitBtn.disabled = false;
  }
});
