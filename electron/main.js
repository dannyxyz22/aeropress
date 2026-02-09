/**
 * Processo principal do Electron — janela, diálogos e compressão via Ghostscript.
 */
import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { compressPdf } from "../server/compress.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 560,
    height: 620,
    minWidth: 400,
    minHeight: 480,
    webPreferences: {
      preload: path.resolve(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: "Compactador de PDF",
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, "..", "public", "index-electron.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});

/** Janela pai para diálogos (focada ou principal) — evita diálogo não aparecer no Windows */
function getDialogParent() {
  return BrowserWindow.getFocusedWindow() || mainWindow;
}

/** Selecionar arquivo PDF (abre diálogo) */
ipcMain.handle("select-pdf", async () => {
  const parent = getDialogParent();
  if (parent && !parent.isDestroyed()) {
    parent.focus();
  }
  const result = await dialog.showOpenDialog(parent, {
    title: "Selecionar PDF",
    filters: [{ name: "PDF", extensions: ["pdf"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths?.length) return null;
  const filePath = result.filePaths[0];
  try {
    const stat = await fs.stat(filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
      size: stat.size,
    };
  } catch {
    return null;
  }
});

/** Compactar PDF e salvar (diálogo "Salvar como") */
ipcMain.handle("compress", async (_event, { inputPath, preset }) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdfcomp-electron-"));
  const outputPath = path.join(tempDir, "compressed.pdf");

  const sendProgress = (current, total) => {
    const p = total > 0 ? Math.round((current / total) * 100) : 0;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("compress-progress", Math.min(100, p));
    }
  };

  try {
    const inputStat = await fs.stat(inputPath);
    const originalSize = inputStat.size;

    await compressPdf(inputPath, outputPath, preset || "medium", {
      onProgress: sendProgress,
    });

    const outputStat = await fs.stat(outputPath);
    const compressedSize = outputStat.size;

    const saveResult = await dialog.showSaveDialog(getDialogParent(), {
      title: "Salvar PDF compactado",
      defaultPath: path.join(path.dirname(inputPath), "compactado.pdf"),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });

    if (saveResult.canceled || !saveResult.filePath) {
      await fs.rm(tempDir, { recursive: true, force: true });
      return { canceled: true };
    }

    await fs.copyFile(outputPath, saveResult.filePath);
    await fs.rm(tempDir, { recursive: true, force: true });

    return {
      canceled: false,
      originalSize,
      compressedSize,
      savedPath: saveResult.filePath,
    };
  } catch (err) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
});

/** Abrir pasta no explorador de arquivos */
ipcMain.handle("show-item-in-folder", (_event, filePath) => {
  shell.showItemInFolder(filePath);
});
