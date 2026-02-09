/**
 * Módulo de compressão de PDF via Ghostscript.
 * Suporta callback de progresso (páginas processadas) quando o Ghostscript
 * emite "Page N" em stderr (sem -dQUIET).
 */
import { spawn } from "node:child_process";
import path from "node:path";

const PRESETS = {
  low: "/screen",
  medium: "/ebook",
  high: "/printer",
  max: "/prepress",
};

const DEFAULT_ARGS_BASE = [
  "-sDEVICE=pdfwrite",
  "-dCompatibilityLevel=1.4",
  "-dNOPAUSE",
  "-dBATCH",
  "-dDetectDuplicateImages=true",
  "-dCompressFonts=true",
  "-dSubsetFonts=true",
];

// Com -dQUIET não há progresso; sem -dQUIET o Ghostscript pode emitir "Page N" em stderr
const PAGE_RE = /Page\s+(\d+)/i;

// Lista de comandos tentados (lido em tempo de execução para respeitar GHOSTSCRIPT_PATH definido depois do load, ex.: app empacotado).
function getCandidateCommands() {
  const envCommand = process.env.GHOSTSCRIPT_PATH;
  if (envCommand) return [envCommand];
  if (process.platform === "win32") return ["gswin64c", "gswin32c", "gs"];
  return ["gs"];
}

/**
 * Obtém o número de páginas do PDF (para calcular percentual de progresso).
 * Retorna 0 se não for possível obter (ex.: GS antigo ou falha).
 */
function getPageCount(command, inputPath) {
  return new Promise((resolve) => {
    const pathForPs = inputPath.replace(/\\/g, "/");
    const args = [
      "-q",
      "-dNODISPLAY",
      "-c",
      `(${pathForPs}) (r) file runpdfbegin pdfpagecount = quit`,
    ];
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", () => resolve(0));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve(0);
        return;
      }
      const n = parseInt(stdout.trim(), 10);
      resolve(Number.isInteger(n) && n > 0 ? n : 0);
    });
  });
}

function runGhostscript(command, inputPath, outputPath, preset, totalPages = 0, onProgress) {
  const pdfSetting = PRESETS[preset] ?? PRESETS.medium;
  const args = [
    ...DEFAULT_ARGS_BASE,
    `-dPDFSETTINGS=${pdfSetting}`,
    `-sOutputFile=${outputPath}`,
    inputPath,
  ];
  if (!onProgress) args.splice(3, 0, "-dQUIET");

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (onProgress) {
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          const m = line.match(PAGE_RE);
          if (m) {
            const current = parseInt(m[1], 10);
            if (Number.isInteger(current)) onProgress(current, totalPages);
          }
        }
      }
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `Ghostscript exited with code ${code}`));
    });
  });
}

async function runWithFallbacks(inputPath, outputPath, preset, options = {}) {
  let lastError;
  for (const command of getCandidateCommands()) {
    try {
      let totalPages = 0;
      if (options.onProgress) {
        totalPages = await getPageCount(command, inputPath);
      }
      await runGhostscript(command, inputPath, outputPath, preset, totalPages, options.onProgress);
      return;
    } catch (error) {
      lastError = error;
      if (error?.code !== "ENOENT") break;
    }
  }
  throw lastError || new Error("Ghostscript not available");
}

/**
 * Compacta o PDF em inputPath e grava em outputPath.
 * @param {object} [options] - Opções.
 * @param {function(number, number)} [options.onProgress] - Callback (currentPage, totalPages). totalPages pode ser 0 se não for possível obter.
 */
export async function compressPdf(inputPath, outputPath, preset, options = {}) {
  await runWithFallbacks(inputPath, outputPath, preset, options);
}
