import express from "express";
import multer from "multer";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { compressPdf } from "./compress.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const MAX_FILE_SIZE = 100 * 1024 * 1024;

const upload = multer({
  dest: path.join(os.tmpdir(), "pdfcomp-uploads"),
  limits: { fileSize: MAX_FILE_SIZE },
  // Ghostscript espera PDF; rejeitar outros tipos evita erros obscuros e uso indevido do servidor.
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
      return;
    }
    cb(new Error("Only PDF files are allowed."));
  },
});

app.use(express.static(path.join(__dirname, "..", "public")));

app.post("/api/compress", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Arquivo PDF obrigatório." });
    return;
  }

  const preset = req.body.preset || "medium";
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "pdfcomp-"));
  const outputPath = path.join(tempDir, "compressed.pdf");

  try {
    await compressPdf(req.file.path, outputPath, preset);
    const originalSize = req.file.size;
    const compressedStat = await fsp.stat(outputPath);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=\"compressed.pdf\"",
      "X-Original-Size": String(originalSize),
      "X-Compressed-Size": String(compressedStat.size),
    });

    // A limpeza fica no callback para rodar só depois do envio completo (ou falha no envio),
    // evitando apagar o arquivo antes do cliente receber. Se der erro depois que os headers
    // foram enviados, não é possível enviar JSON; apenas limpamos e o cliente vê resposta quebrada.
    res.download(outputPath, "compressed.pdf", async (err) => {
      await cleanupFiles(req.file.path, tempDir);
      if (err && !res.headersSent) {
        res.status(500).json({ error: "Falha ao enviar o arquivo." });
      }
    });
  } catch (error) {
    await cleanupFiles(req.file.path, tempDir);
    res.status(500).json({
      error:
        error?.message ||
        "Falha na compressao. Verifique o Ghostscript.",
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`PDF compressor running on http://localhost:${PORT}`);
});

async function cleanupFiles(uploadPath, tempDir) {
  await safeUnlink(uploadPath);
  await safeRm(tempDir);
}

async function safeUnlink(targetPath) {
  try {
    await fsp.unlink(targetPath);
  } catch {
    // ignore cleanup errors
  }
}

async function safeRm(targetPath) {
  try {
    await fsp.rm(targetPath, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}
