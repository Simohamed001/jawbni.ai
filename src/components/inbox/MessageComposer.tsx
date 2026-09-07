"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input, Textarea } from "@/components/ui/button";
import { Mic, Send, Square, Type } from "lucide-react";
import { blobToWavFile } from "@/lib/wav";
import { cn } from "@/lib/utils";

interface MessageComposerProps {
  onSent: () => void;
}

export function MessageComposer({ onSent }: MessageComposerProps) {
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [customerName, setCustomerName] = useState("");
  const [body, setBody] = useState("");
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [manualTranscription, setManualTranscription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function startRecording() {
    if (recording) return;
    setError("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("المتصفح لا يدعم الوصول إلى الميكروفون");
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (firstError) {
        if (!(firstError instanceof DOMException) || firstError.name !== "NotReadableError") {
          throw firstError;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const microphones = devices.filter((device) => device.kind === "audioinput");
        let lastError: unknown = firstError;
        for (const microphone of microphones) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: { deviceId: { exact: microphone.deviceId } },
            });
            break;
          } catch (deviceError) {
            lastError = deviceError;
          }
        }
        if (!stream!) throw lastError;
      }
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      const message =
        name === "NotAllowedError" || name === "SecurityError"
          ? "اسمح للموقع باستخدام الميكروفون من إعدادات Chrome"
          : name === "NotReadableError" || name === "AbortError"
            ? "الميكروفون غير متاح أو مستخدم من تطبيق آخر"
            : error instanceof Error
              ? error.message
              : "تعذر الوصول إلى الميكروفون";
      setError(message);
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      let response: Response;
      if (mode === "text") {
        response = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerName: customerName || "زبون",
            body,
            messageType: "text",
          }),
        });
      } else {
        const form = new FormData();
        form.append("customerName", customerName || "زبون");
        form.append("messageType", "voice");
        if (audioBlob) {
          try {
            const wavFile = await blobToWavFile(audioBlob);
            form.append("audio", wavFile);
          } catch (error) {
            console.warn("WAV conversion failed, sending original audio:", error);
            const ext = audioBlob.type.includes("ogg") ? "ogg" : "webm";
            form.append("audio", audioBlob, `recording.${ext}`);
          }
        }
        if (manualTranscription) {
          form.append("transcription", manualTranscription);
        }
        response = await fetch("/api/messages", { method: "POST", body: form });
      }

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "تعذر إرسال الرسالة");
      }

      if (mode === "text") {
        setBody("");
      } else {
        setAudioBlob(null);
        setManualTranscription("");
      }
      setCustomerName("");
      onSent();
    } catch (error) {
      setError(error instanceof Error ? error.message : "تعذر إرسال الرسالة");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t bg-white p-3">
      <div className="mb-2 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("text")}
          className={cn(
            "flex items-center gap-1 rounded-lg px-3 py-1 text-xs",
            mode === "text" ? "bg-[#25D366] text-white" : "bg-gray-100",
          )}
        >
          <Type className="h-3 w-3" /> نص
        </button>
        <button
          type="button"
          onClick={() => setMode("voice")}
          className={cn(
            "flex items-center gap-1 rounded-lg px-3 py-1 text-xs",
            mode === "voice" ? "bg-[#25D366] text-white" : "bg-gray-100",
          )}
        >
          <Mic className="h-3 w-3" /> صوت
        </button>
      </div>

      <Input
        placeholder="اسم الزبون (اختياري)"
        value={customerName}
        onChange={(e) => setCustomerName(e.target.value)}
        className="mb-2"
      />

      {mode === "text" ? (
        <Textarea
          placeholder="اكتب رسالة الزبون..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          required
        />
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {!recording ? (
              <Button type="button" variant="outline" onClick={startRecording}>
                <Mic className="ml-1 h-4 w-4" /> تسجيل
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={stopRecording}>
                <Square className="ml-1 h-4 w-4" /> إيقاف
              </Button>
            )}
            <label className="cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
              رفع ملف
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => setAudioBlob(e.target.files?.[0] || null)}
              />
            </label>
          </div>
          {audioBlob && (
            <audio controls src={URL.createObjectURL(audioBlob)} className="w-full" />
          )}
          <Input
            placeholder="نسخ يدوي احتياطي (اختياري)"
            value={manualTranscription}
            onChange={(e) => setManualTranscription(e.target.value)}
          />
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <Button
        type="submit"
        disabled={loading || (mode === "voice" && !audioBlob)}
        className="mt-2 w-full"
      >
        <Send className="ml-1 h-4 w-4" />
        {loading ? "جاري الإرسال..." : "إضافة رسالة"}
      </Button>
    </form>
  );
}
