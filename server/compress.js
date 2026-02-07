/**
 * Módulo de compressão de PDF via Ghostscript.
 * Encapsula a chamada ao binário (gs / gswin64c etc.) com presets de qualidade
 * e fallback de comando no Windows quando o executável não está no PATH.
 */
import { spawn } from "node:child_process";

const PRESETS = {
  low: "/screen",
  medium: "/ebook",
  high: "/printer",
  max: "/prepress",
};

const DEFAULT_ARGS = [
  "-sDEVICE=pdfwrite",
  "-dCompatibilityLevel=1.4",
  "-dNOPAUSE",
  "-dQUIET",
  "-dBATCH",
  "-dDetectDuplicateImages=true",
  "-dCompressFonts=true",
  "-dSubsetFonts=true",
];

// No Windows o instalador usa gswin64c/gswin32c, que costumam não estar no PATH.
// GHOSTSCRIPT_PATH permite apontar para o executável exato sem alterar o PATH do sistema.
const CANDIDATE_COMMANDS = (() => {
  const envCommand = process.env.GHOSTSCRIPT_PATH;
  if (envCommand) {
    return [envCommand];
  }
  if (process.platform === "win32") {
    return ["gswin64c", "gswin32c", "gs"];
  }
  return ["gs"];
})();

function runGhostscript(command, inputPath, outputPath, preset) {
  return new Promise((resolve, reject) => {
    const pdfSetting = PRESETS[preset] ?? PRESETS.medium;
    const args = [
      ...DEFAULT_ARGS,
      `-dPDFSETTINGS=${pdfSetting}`,
      `-sOutputFile=${outputPath}`,
      inputPath,
    ];

    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `Ghostscript exited with code ${code}`));
    });
  });
}

// Só tentamos o próximo comando quando o erro é ENOENT (executável não encontrado).
// Qualquer outro erro (ex.: Ghostscript falhou no processamento) não deve ser
// mascarado tentando outro binário.
async function runWithFallbacks(inputPath, outputPath, preset) {
  let lastError;
  for (const command of CANDIDATE_COMMANDS) {
    try {
      await runGhostscript(command, inputPath, outputPath, preset);
      return;
    } catch (error) {
      lastError = error;
      if (error?.code !== "ENOENT") {
        break;
      }
    }
  }
  throw lastError || new Error("Ghostscript not available");
}

export async function compressPdf(inputPath, outputPath, preset) {
  await runWithFallbacks(inputPath, outputPath, preset);
}
