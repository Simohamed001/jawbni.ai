---
name: Gemini classification runtime
description: Environment and quota constraints that affect the message classification pipeline.
---

The project environment provides the Gemini credential as `GEMINI_API_KEY`; integrations should keep `GOOGLE_AI_API_KEY` only as a compatibility fallback.

**Why:** When the classifier looked only for the Google-prefixed name, every AI request silently fell into the review/heuristic path. The free tier also limits requests per model, and each message may use both primary and additional-intent analysis.

**How to apply:** Keep primary and additional classification calls on the shared model-rotation helper, and rotate before the fifth-per-model quota is exceeded. If all models fail, prefer the review category over guessing from isolated keywords.