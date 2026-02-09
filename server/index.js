import express from "express";
import multer from "multer";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { compressPdf } from "./compress.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Onde os erros podem ocorrer (respostas JSON incluem campo "where" quando aplicável):
 * - init: totalSize/totalChunks inválidos, tamanho > 1 GB, número de chunks inválido
 * - chunk: uploadId/chunkIndex ausentes, upload não encontrado, chunk fora de ordem, chunk ausente, chunk > 5 MB (Multer)
 * - finalize: uploadId ausente, upload não encontrado, upload incompleto
 * - ghostscript: falha ao compactar (Ghostscript não encontrado ou erro ao processar PDF)
 */
// Limites: 1 GB para o arquivo completo; 5 MB por chunk
const MAX_FILE_SIZE = 1024 * 1024 * 1024;
const MAX_CHUNK_SIZE = 5 * 1024 * 1024;

/** Estado dos uploads em andamento: uploadId -> { uploadPath, tempDir, totalSize, totalChunks, nextChunk, preset } */
const uploads = new Map();

/** Jobs de compressão (finalize assíncrono): jobId -> { status, progress, upload?, outputPath?, error?, originalSize?, compressedSize? } */
const jobs = new Map();

// JSON para init e finalize
app.use(express.json({ limit: "1kb" }));

const publicPath = path.join(__dirname, "..", "public");
const utf8Mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};
app.use(express.static(publicPath, {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (utf8Mime[ext]) res.setHeader("Content-Type", utf8Mime[ext]);
  },
}));

// --- Upload em chunks ---

/** POST /api/compress/init — Inicia um upload. Corpo: { filename, totalSize, totalChunks, preset }. */
app.post("/api/compress/init", async (req, res) => {
  const where = "init";
  try {
    const { filename, totalSize, totalChunks, preset } = req.body;

    if (totalSize == null || totalChunks == null) {
      res.status(400).json({
        error: "Requisição inválida: totalSize e totalChunks são obrigatórios.",
        where,
      });
      return;
    }

    const size = Number(totalSize);
    const chunks = Number(totalChunks);

    if (size > MAX_FILE_SIZE) {
      res.status(400).json({
        error: `Tamanho máximo excedido. Limite: 1 GB. Recebido: ${(size / (1024 * 1024 * 1024)).toFixed(2)} GB.`,
        where,
      });
      return;
    }

    if (!Number.isInteger(chunks) || chunks < 1 || chunks > 20000) {
      res.status(400).json({
        error: "Número de chunks inválido (deve ser entre 1 e 20000).",
        where,
      });
      return;
    }

    const uploadId = randomUUID();
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "pdfcomp-"));
    const uploadPath = path.join(tempDir, "input.pdf");

    await fsp.writeFile(uploadPath, Buffer.alloc(0));

    uploads.set(uploadId, {
      uploadPath,
      tempDir,
      totalSize: size,
      totalChunks: chunks,
      nextChunk: 0,
      preset: preset || "medium",
    });

    res.status(200).json({ uploadId });
  } catch (err) {
    res.status(500).json({
      error: err?.message || "Erro interno ao iniciar upload.",
      where,
    });
  }
});

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CHUNK_SIZE },
}).single("chunk");

/** POST /api/compress/chunk — Envia um chunk. FormData: uploadId, chunkIndex, chunk (arquivo). */
app.post("/api/compress/chunk", (req, res, next) => {
  chunkUpload(req, res, (err) => {
    if (err) {
      const where = "chunk";
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({
          error: `Tamanho do chunk excede o limite (máx. 5 MB por chunk).`,
          where,
        });
        return;
      }
      res.status(500).json({ error: err?.message || "Erro ao processar chunk.", where });
      return;
    }
    next();
  });
}, async (req, res) => {
  const where = "chunk";
  let uploadId = null;
  let upload = null;

  try {
    uploadId = req.body?.uploadId;
    const chunkIndex = req.body?.chunkIndex != null ? Number(req.body.chunkIndex) : null;

    if (!uploadId || chunkIndex == null || !Number.isInteger(chunkIndex) || chunkIndex < 0) {
      res.status(400).json({
        error: "Requisição inválida: uploadId e chunkIndex (número) são obrigatórios.",
        where,
      });
      return;
    }

    upload = uploads.get(uploadId);
    if (!upload) {
      res.status(404).json({
        error: "Upload não encontrado ou expirado. Reinicie o envio.",
        where,
      });
      return;
    }

    if (chunkIndex !== upload.nextChunk) {
      res.status(400).json({
        error: `Chunk fora de ordem. Esperado: ${upload.nextChunk}, recebido: ${chunkIndex}. Envie os chunks em sequência.`,
        where,
      });
      return;
    }

    if (!req.file || !req.file.buffer) {
      res.status(400).json({
        error: "Nenhum dado de chunk enviado (campo 'chunk' obrigatório).",
        where,
      });
      return;
    }

    await fsp.appendFile(upload.uploadPath, req.file.buffer);
    upload.nextChunk += 1;

    res.status(200).json({ received: chunkIndex });
  } catch (err) {
    res.status(500).json({
      error: err?.message || "Erro interno ao salvar chunk.",
      where,
    });
  }
});

/** POST /api/compress/finalize — Inicia a compressão em background e retorna jobId. Corpo: { uploadId }. */
app.post("/api/compress/finalize", async (req, res) => {
  const where = "finalize";
  let uploadId = null;
  let upload = null;

  try {
    uploadId = req.body?.uploadId;
    if (!uploadId) {
      res.status(400).json({
        error: "Requisição inválida: uploadId é obrigatório.",
        where,
      });
      return;
    }

    upload = uploads.get(uploadId);
    if (!upload) {
      res.status(404).json({
        error: "Upload não encontrado ou expirado. Reinicie o envio.",
        where,
      });
      return;
    }

    if (upload.nextChunk !== upload.totalChunks) {
      res.status(400).json({
        error: `Upload incompleto. Recebidos ${upload.nextChunk} de ${upload.totalChunks} chunks.`,
        where,
      });
      return;
    }

    const jobId = randomUUID();
    const outputPath = path.join(upload.tempDir, "compressed.pdf");

    uploads.delete(uploadId);

    const job = {
      status: "compressing",
      progress: 0,
      upload,
      outputPath,
      error: null,
      originalSize: upload.totalSize,
      compressedSize: null,
    };
    jobs.set(jobId, job);

    res.status(200).json({ jobId });

    compressPdf(upload.uploadPath, outputPath, upload.preset, {
      onProgress: (currentPage, totalPages) => {
        const p = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
        job.progress = Math.min(100, p);
      },
    })
      .then(async () => {
        try {
          const stat = await fsp.stat(outputPath);
          job.status = "done";
          job.progress = 100;
          job.compressedSize = stat.size;
        } catch {
          job.status = "error";
          job.error = "Arquivo compactado não encontrado.";
        }
      })
      .catch((err) => {
        job.status = "error";
        job.progress = 0;
        job.error = err?.message || "Falha ao compactar (Ghostscript).";
        safeRm(upload.tempDir);
      });
  } catch (err) {
    if (uploadId) await cleanupUpload(uploadId);
    res.status(500).json({
      error: err?.message || "Erro interno ao finalizar upload.",
      where,
    });
  }
});

/** GET /api/compress/status?jobId=xxx — Retorna status e progresso da compressão. */
app.get("/api/compress/status", (req, res) => {
  const jobId = req.query?.jobId;
  if (!jobId) {
    res.status(400).json({ error: "jobId é obrigatório.", where: "status" });
    return;
  }
  const job = jobs.get(jobId);
  if (!job) {
    res.status(404).json({ error: "Job não encontrado ou já concluído.", where: "status" });
    return;
  }
  res.status(200).json({
    status: job.status,
    progress: job.progress,
    error: job.error || undefined,
  });
  if (job.status === "error") {
    setTimeout(() => cleanupJob(jobId), 5000);
  }
});

/** GET /api/compress/result?jobId=xxx — Retorna o PDF compactado quando status === 'done'. */
app.get("/api/compress/result", (req, res) => {
  const jobId = req.query?.jobId;
  if (!jobId) {
    res.status(400).json({ error: "jobId é obrigatório.", where: "result" });
    return;
  }
  const job = jobs.get(jobId);
  if (!job) {
    res.status(404).json({ error: "Job não encontrado ou já concluído.", where: "result" });
    return;
  }
  if (job.status !== "done") {
    res.status(400).json({
      error: job.status === "error" ? job.error : "Compressão ainda em andamento.",
      where: "result",
    });
    return;
  }

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": "attachment; filename=\"compressed.pdf\"",
    "X-Original-Size": String(job.originalSize),
    "X-Compressed-Size": String(job.compressedSize),
  });

  const stream = fs.createReadStream(job.outputPath);
  stream.pipe(res);
  stream.on("end", () => cleanupJob(jobId));
  stream.on("error", () => cleanupJob(jobId));
});

function cleanupJob(jobId) {
  const job = jobs.get(jobId);
  if (job) {
    jobs.delete(jobId);
    if (job.upload?.tempDir) safeRm(job.upload.tempDir);
  }
}

async function cleanupUpload(uploadId) {
  const upload = uploads.get(uploadId);
  if (upload) {
    uploads.delete(uploadId);
    await safeUnlink(upload.uploadPath);
    await safeRm(upload.tempDir);
  }
}

async function safeUnlink(targetPath) {
  try {
    await fsp.unlink(targetPath);
  } catch {
    // ignore
  }
}

async function safeRm(targetPath) {
  try {
    await fsp.rm(targetPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`PDF compressor running on http://localhost:${PORT}`);
});
