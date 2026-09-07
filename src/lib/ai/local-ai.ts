import { readFile } from "fs/promises";
import { mimeFromAudioPath } from "@/lib/audio";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim() || "";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

export function isLocalConfigured() {
  return Boolean(GEMINI_API_KEY);
}

export interface LocalClassifyResult {
  text: string;
  json: Record<string, unknown> | null;
}

// ─── Model Rotation System ──────────────────────────────────────────────────
// Gemini free tier daily limits (RPD). When a model exhausts its quota,
// the system automatically falls back to the next model in the chain.

interface ModelConfig {
  id: string;
  dailyLimit: number;
}

const GEMINI_MODELS: ModelConfig[] = [
  { id: "gemini-3.5-flash", dailyLimit: 1500 },
  { id: "gemini-3.5-flash-lite", dailyLimit: 1500 },
  { id: "gemini-3.1-flash-lite", dailyLimit: 1500 },
];

// Per-model daily usage tracker (resets at midnight Pacific Time)
const dailyUsage: Map<string, { count: number; date: string }> = new Map();

function getPacificDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function getModelUsage(modelId: string): number {
  const today = getPacificDate();
  const entry = dailyUsage.get(modelId);
  if (!entry || entry.date !== today) {
    dailyUsage.set(modelId, { count: 0, date: today });
    return 0;
  }
  return entry.count;
}

function incrementModelUsage(modelId: string): void {
  const today = getPacificDate();
  const entry = dailyUsage.get(modelId);
  if (!entry || entry.date !== today) {
    dailyUsage.set(modelId, { count: 1, date: today });
  } else {
    entry.count += 1;
  }
}

function getActiveModel(): ModelConfig {
  for (const model of GEMINI_MODELS) {
    if (getModelUsage(model.id) < model.dailyLimit) {
      return model;
    }
    console.log(`[Gemini Rotation] Model ${model.id} reached daily limit (${model.dailyLimit} RPD), trying next...`);
  }
  // If all models exhausted, use the last one (will likely get 429 but we handle it)
  return GEMINI_MODELS[GEMINI_MODELS.length - 1];
}

// ─── JSON Extraction ────────────────────────────────────────────────────────

function extractJsonObject(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// ─── Text Classification via Gemini ─────────────────────────────────────────

export async function classifyLocal(prompt: string): Promise<LocalClassifyResult> {
  const model = getActiveModel();
  console.log(`[Gemini] Using model: ${model.id} (${getModelUsage(model.id)}/${model.dailyLimit} daily requests)`);

  const body: Record<string, unknown> = {
    model: model.id,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 700,
    temperature: 0,
  };

  const res = await fetch(`${GEMINI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${GEMINI_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  // Track usage for non-429 responses
  if (res.status !== 429) {
    incrementModelUsage(model.id);
  }

  // Handle rate limit: try next model in chain
  if (res.status === 429) {
    console.warn(`[Gemini] Model ${model.id} rate limited (429), attempting fallback...`);
    incrementModelUsage(model.id); // Mark as exhausted
    return classifyWithFallback(prompt, model.id);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    throw new Error(`Gemini /chat/completions failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as {
    choices?: {
      message?: {
        content?: string;
      };
    }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  console.log(`[Gemini] Raw response from ${model.id}:`, JSON.stringify(content).substring(0, 2000));

  const json = extractJsonObject(content);
  return { text: content, json };
}

async function classifyWithFallback(prompt: string, excludeModelId: string): Promise<LocalClassifyResult> {
  for (const model of GEMINI_MODELS) {
    if (model.id === excludeModelId) continue;
    if (getModelUsage(model.id) >= model.dailyLimit) continue;

    console.log(`[Gemini] Trying fallback model: ${model.id}`);
    const body: Record<string, unknown> = {
      model: model.id,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 700,
      temperature: 0,
    };

    try {
      const res = await fetch(`${GEMINI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${GEMINI_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });

      incrementModelUsage(model.id);

      if (res.status === 429) {
        console.warn(`[Gemini] Fallback model ${model.id} also rate limited`);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "unknown");
        console.error(`[Gemini] Fallback model ${model.id} failed: ${res.status} ${errText}`);
        continue;
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content ?? "";
      const json = extractJsonObject(content);
      return { text: content, json };
    } catch (err) {
      console.error(`[Gemini] Fallback model ${model.id} error:`, err);
      continue;
    }
  }

  throw new Error("All Gemini models exhausted their daily limits");
}

// ─── Audio Transcription via Gemini ─────────────────────────────────────────
// Gemini natively understands audio — no separate Whisper needed.
// Sends audio as base64 inline and asks for transcription.

export async function transcribeLocal(filePath: string): Promise<string> {
  const model = getActiveModel();
  console.log(`[Gemini Transcribe] Using model: ${model.id}`);

  const buf = await readFile(filePath);
  const mimeType = mimeFromAudioPath(filePath);
  const base64Audio = Buffer.from(buf).toString("base64");

  const body = {
    model: model.id,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcribe this audio message exactly as spoken. The speaker is likely a Moroccan customer speaking in Darija (Moroccan Arabic), French, or a mix. Output ONLY the transcribed text, nothing else.",
          },
          {
            type: "input_audio",
            input_audio: {
              data: base64Audio,
              format: mimeType.replace("audio/", ""),
            },
          },
        ],
      },
    ],
    max_tokens: 2000,
    temperature: 0,
  };

  const res = await fetch(`${GEMINI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${GEMINI_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (res.status !== 429) {
    incrementModelUsage(model.id);
  }

  if (res.status === 429) {
    console.warn(`[Gemini Transcribe] Model ${model.id} rate limited, trying fallback...`);
    incrementModelUsage(model.id);
    return transcribeWithFallback(filePath, model.id);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    throw new Error(`Gemini audio transcription failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

async function transcribeWithFallback(filePath: string, excludeModelId: string): Promise<string> {
  const buf = await readFile(filePath);
  const mimeType = mimeFromAudioPath(filePath);
  const base64Audio = Buffer.from(buf).toString("base64");

  for (const model of GEMINI_MODELS) {
    if (model.id === excludeModelId) continue;
    if (getModelUsage(model.id) >= model.dailyLimit) continue;

    console.log(`[Gemini Transcribe] Trying fallback model: ${model.id}`);

    const body = {
      model: model.id,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcribe this audio message exactly as spoken. The speaker is likely a Moroccan customer speaking in Darija (Moroccan Arabic), French, or a mix. Output ONLY the transcribed text, nothing else.",
            },
            {
              type: "input_audio",
              input_audio: {
                data: base64Audio,
                format: mimeType.replace("audio/", ""),
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0,
    };

    try {
      const res = await fetch(`${GEMINI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${GEMINI_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });

      incrementModelUsage(model.id);

      if (res.status === 429) {
        console.warn(`[Gemini Transcribe] Fallback model ${model.id} also rate limited`);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "unknown");
        console.error(`[Gemini Transcribe] Fallback model ${model.id} failed: ${res.status} ${errText}`);
        continue;
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return data.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      console.error(`[Gemini Transcribe] Fallback model ${model.id} error:`, err);
      continue;
    }
  }

  throw new Error("All Gemini models exhausted their daily limits for transcription");
}
