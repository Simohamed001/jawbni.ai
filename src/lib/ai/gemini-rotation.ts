import {
  GoogleGenerativeAI,
  GenerativeModel,
} from "@google/generative-ai";

// نماذج Gemini 3 المجانية — التصنيف والنص
const GEMINI_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];

// نفس نماذج Gemini 3 تُستخدم للصوت أيضاً
const AUDIO_FALLBACK_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];

// Gemini's free tier currently allows five requests per model per minute.
// Rotate before the sixth request so the second classification pass does not
// exhaust the active model immediately.
const MAX_REQUESTS_PER_MODEL = 5;

// تتبّع الطلبات لكل نموذج (يفترض أن العملية تبدأ من جديد لكل طلب)
const requestCounts = new Map<string, number>();

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!key || key === "YOUR_GEMINI_API_KEY_HERE" || key.trim() === "") {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to your environment variables.",
    );
  }
  console.log("[Gemini] API Key is configured");
  return key;
}

export function getGeminiApiKey(): string {
  return getApiKey();
}

let currentModelIndex = 0;

export function getCurrentModel(): string {
  return GEMINI_MODELS[currentModelIndex];
}

export function recordRequest(modelName?: string): void {
  const model = modelName || GEMINI_MODELS[currentModelIndex];
  const count = (requestCounts.get(model) || 0) + 1;
  requestCounts.set(model, count);

  if (count >= MAX_REQUESTS_PER_MODEL) {
    requestCounts.set(model, 0);
    currentModelIndex = (currentModelIndex + 1) % GEMINI_MODELS.length;
    console.log(`[Gemini] Rotated to model: ${GEMINI_MODELS[currentModelIndex]}`);
  }
}

export function resetRequestCount(): void {
  requestCounts.clear();
  currentModelIndex = 0;
}

export function getRotationStatus() {
  return {
    currentModel: GEMINI_MODELS[currentModelIndex],
    requestCounts: Array.from(requestCounts.entries()),
    maxRequests: MAX_REQUESTS_PER_MODEL,
  };
}

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  return !!key && key !== "YOUR_GEMINI_API_KEY_HERE" && key.trim() !== "";
}

export function getGeminiClient(
  modelName?: string,
  jsonOutput = false,
): GenerativeModel {
  const genAI = new GoogleGenerativeAI(getApiKey());
  const model = modelName || GEMINI_MODELS[currentModelIndex];

  const config: {
    model: string;
    generationConfig?: { responseMimeType?: string; temperature: number };
  } = { model };

  if (jsonOutput) {
    config.generationConfig = {
      responseMimeType: "application/json",
      temperature: 0.1,
    };
  } else {
    config.generationConfig = {
      temperature: 0.1,
    };
  }

  return genAI.getGenerativeModel(config);
}

export function getAudioModelCandidates(): string[] {
  // يبدأ من النموذج الحالي ثم يكمّل بالنماذج الاحتياطية
  const current = GEMINI_MODELS[currentModelIndex];
  const afterCurrent = GEMINI_MODELS.slice(currentModelIndex + 1);
  const unique = Array.from(new Set([current, ...afterCurrent, ...AUDIO_FALLBACK_MODELS]));
  return unique;
}

export function getTextModelCandidates(): string[] {
  const current = GEMINI_MODELS[currentModelIndex];
  const afterCurrent = GEMINI_MODELS.slice(currentModelIndex + 1);
  return Array.from(new Set([current, ...afterCurrent, ...GEMINI_MODELS]));
}

/**
 * Try the available text models in rotation. This is especially important
 * when the free-tier quota for one model has been exhausted.
 */
export async function generateTextContent(
  prompt: string,
  jsonOutput = false,
) {
  let lastError: unknown;

  console.log(`[Gemini] Attempting to generate content with ${jsonOutput ? 'JSON' : 'text'} output`);
  console.log(`[Gemini] Available models: ${getTextModelCandidates().join(', ')}`);

  for (const modelName of getTextModelCandidates()) {
    try {
      console.log(`[Gemini] Trying model: ${modelName}`);
      const model = getGeminiClient(modelName, jsonOutput);
      recordRequest(modelName);
      const result = await model.generateContent(prompt);
      console.log(`[Gemini] Successfully generated content using ${modelName}`);
      return result;
    } catch (error) {
      lastError = error;
      console.error(`[Gemini] Model ${modelName} failed with error:`, error);
      console.warn(`[Gemini] Trying the next model...`);
    }
  }

  console.error(`[Gemini] All models failed. Last error:`, lastError);
  throw lastError instanceof Error
    ? lastError
    : new Error("All Gemini text models failed");
}