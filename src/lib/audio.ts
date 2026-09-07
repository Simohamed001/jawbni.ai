import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "audio");
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
];

export function normalizeAudioMime(mime: string) {
  return mime.split(";")[0].trim().toLowerCase();
}

export function mimeFromAudioPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const byExt: Record<string, string> = {
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
  };
  return byExt[ext] || "audio/webm";
}

const EXT_MAP: Record<string, string> = {
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/wav": ".wav",
};

export async function saveAudioFile(file: File): Promise<{ audioPath: string; fullPath: string }> {
  if (file.size > MAX_SIZE) {
    throw new Error("حجم الملف يتجاوز 10MB");
  }

  const mime = normalizeAudioMime(file.type || "audio/webm");
  if (!ALLOWED_TYPES.includes(mime) && !file.name.match(/\.(webm|ogg|mp3|m4a|wav)$/i)) {
    throw new Error("صيغة الصوت غير مدعومة");
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  const ext =
    EXT_MAP[mime] ||
    path.extname(file.name) ||
    ".webm";
  const filename = `${randomUUID()}${ext}`;
  const fullPath = path.join(UPLOAD_DIR, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buffer);

  return {
    audioPath: `/uploads/audio/${filename}`,
    fullPath,
  };
}

export function getFullAudioPath(audioPath: string) {
  return path.join(process.cwd(), "public", audioPath.replace(/^\//, ""));
}
