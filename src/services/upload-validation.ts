import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
const extensions: Record<string, string[]> = { "application/pdf": ["pdf"], "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"] };
const imageFormats: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
export type ValidatedUpload = { bytes: ArrayBuffer; mime: string; extension: string };
// Pure Node validation shared by server actions and real-file tests. No storage credentials here.
export async function validateUpload(file: File, allowed: readonly string[], maxBytes: number): Promise<ValidatedUpload> {
  if (!file.size) throw new Error("Selecione um arquivo não vazio.");
  if (file.size > maxBytes) throw new Error(`O arquivo deve ter no máximo ${maxBytes / (1024 * 1024)} MB.`);
  const extension = file.name.split(".").at(-1)?.toLowerCase() || "";
  if (!allowed.includes(file.type) || !extensions[file.type]?.includes(extension)) throw new Error("Extensão e MIME devem corresponder a um formato permitido.");
  const bytes = await file.arrayBuffer();
  if (file.type === "application/pdf") {
    const decoder = new TextDecoder("ascii");
    if (!/^%PDF-\d\.\d/.test(decoder.decode(bytes.slice(0, 8))) || !decoder.decode(bytes.slice(-1024)).includes("%%EOF")) throw new Error("O conteúdo não corresponde a um PDF válido.");
    try {
      const document = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: true });
      if (!document.getPageCount()) throw new Error("PDF sem páginas");
    } catch { throw new Error("O PDF está corrompido ou não possui páginas válidas."); }
  } else {
    try {
      const image = sharp(Buffer.from(bytes), { failOn: "warning", limitInputPixels: 20_000_000, sequentialRead: true }).timeout({ seconds: 5 });
      const metadata = await image.metadata();
      if (metadata.format !== imageFormats[file.type] || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) throw new Error("Imagem incompatível");
      await image.raw().toBuffer(); // Actually decode; a forged/truncated header must not pass.
    } catch { throw new Error("Conteúdo da imagem inválido, corrompido ou acima do limite de 20 megapixels. Use JPEG, PNG ou WebP estático."); }
  }
  return { bytes, mime: file.type, extension: file.type === "image/jpeg" ? "jpg" : extension };
}
