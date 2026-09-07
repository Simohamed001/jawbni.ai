import { transcribeLocal } from "@/lib/ai/local-ai";

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

export async function transcribeAudio(filePath: string): Promise<string | null> {
  try {
    const raw = await transcribeLocal(filePath);
    return normalizeTranscript(raw);
  } catch (error) {
    console.error("Local Whisper transcription error:", error);
    return null;
  }
}