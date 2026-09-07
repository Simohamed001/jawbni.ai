import { readFile } from "fs/promises";
import path from "path";
import {
  GoogleAIFileManager,
  FileState,
} from "@google/generative-ai/server";
import {
  getGeminiClient,
  getAudioModelCandidates,
  getGeminiApiKey,
} from "@/lib/ai/gemini-rotation";
import { mimeFromAudioPath } from "@/lib/audio";

function normalizeTranscript(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/^```[\w]*\n?|\n?```$/g, "")
    .replace(/^["«»]|["«»]$/g, "")
    .trim();
  if (!cleaned) return null;
  if (/^🎤?\s*رسالة صوتية/.test(cleaned)) return null;
  return cleaned;
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const TRANSCRIBE_PROMPT =
  "Transcribe this audio message exactly as spoken. " +
  "The speaker is likely a Moroccan customer speaking in Darija " +
  "(Moroccan Arabic), French, or a mix including Franco/Arabizi. " +
  "Output ONLY the transcribed text, nothing else.";

async function generateFromInline(
  filePath: string,
  prompt: string,
  modelId: string,
): Promise<{ raw: string }> {
  const mime = mimeFromAudioPath(filePath);
  const base64 = await readFile(filePath, { encoding: "base64" });

  const model = getGeminiClient(modelId);
  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: mime,
        data: base64,
      },
    },
    { text: prompt },
  ]);

  const raw = result.response.text();
  return { raw };
}

async function generateFromUpload(
  filePath: string,
  prompt: string,
  modelId: string,
): Promise<{ raw: string }> {
  const mime = mimeFromAudioPath(filePath);
  const fileManager = new GoogleAIFileManager(getGeminiApiKey());

  const uploadResult = await fileManager.uploadFile(filePath, {
    mimeType: mime,
  });

  const fileUri = uploadResult.file.uri;
  const fileName = uploadResult.file.name;

  try {
    let state = uploadResult.file.state;
    if (state === FileState.PROCESSING) {
      let pollCount = 0;
      while (state === FileState.PROCESSING && pollCount < 8) {
        await sleep(500);
        const fileResult = await fileManager.getFile(fileName);
        state = fileResult.state;
        pollCount++;
      }
    }

    if (state !== FileState.ACTIVE) {
      throw new Error(`Audio file upload stuck in state: ${state}`);
    }

    const model = getGeminiClient(modelId);
    const result = await model.generateContent([
      {
        fileData: {
          fileUri,
          mimeType: mime,
        },
      },
      { text: prompt },
    ]);

    return { raw: result.response.text() };
  } finally {
    try {
      await fileManager.deleteFile(fileName);
    } catch {
      // ignore cleanup errors
    }
  }
}

async function generateFromAudio(
  filePath: string,
  prompt: string,
): Promise<{ raw: string }> {
  const candidates = getAudioModelCandidates();
  let lastError: unknown = null;

  for (const modelId of candidates) {
    console.log(`[Gemini] Audio attempt with model: ${modelId}`);

    // 1) Inline base64 أولاً
    try {
      const inlineResult = await generateFromInline(filePath, prompt, modelId);
      return inlineResult;
    } catch (inlineError) {
      console.warn(
        `[Gemini] Inline base64 failed for ${modelId}:`,
        (inlineError as Error).message,
      );
      lastError = inlineError;

      // 2) رفع الملف عبر GoogleAIFileManager
      try {
        const uploadResult = await generateFromUpload(filePath, prompt, modelId);
        return uploadResult;
      } catch (uploadError) {
        console.warn(
          `[Gemini] File upload fallback failed for ${modelId}:`,
          (uploadError as Error).message,
        );
        lastError = uploadError;
      }
    }
  }

  throw lastError || new Error("All Gemini audio models failed");
}

export async function generateFromVoicePrompt(
  filePath: string,
  prompt: string,
): Promise<{ raw: string; json: Record<string, unknown> | null }> {
  const result = await generateFromAudio(filePath, prompt);
  return {
    raw: result.raw,
    json: extractJsonObject(result.raw),
  };
}

export async function transcribeAudio(filePath: string): Promise<string | null> {
  try {
    const result = await generateFromAudio(filePath, TRANSCRIBE_PROMPT);
    return normalizeTranscript(result.raw);
  } catch (error) {
    console.error("Gemini transcription error:", error);
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { TRANSCRIBE_PROMPT };