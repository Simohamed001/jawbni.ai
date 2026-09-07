"use client";

import { formatTime } from "@/lib/utils";
import { Mic } from "lucide-react";

export interface MessageItem {
  id: string;
  customerName: string;
  body: string;
  messageType: "text" | "voice";
  audioPath?: string | null;
  transcription?: string | null;
  receivedAt: string;
  classification?: {
    mainCategory: { name: string };
    subCategory?: { name: string } | null;
    productName: string;
  } | null;
  additionalClassifications?: Array<{
    mainCategoryName: string;
    subCategoryName?: string | null;
    productName: string;
  }>;
}

interface MessageListProps {
  messages: MessageItem[];
  groupReply?: string;
  onCopyReply?: (text: string) => void;
  onUpdateTranscription?: (id: string, transcription: string) => void;
}

export function MessageList({
  messages,
  onUpdateTranscription,
}: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500 relative z-10">
        لا توجد رسائل في هذه المجموعة
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 relative z-10">
      {messages.map((msg) => (
        <div key={msg.id} className="flex flex-col gap-2">
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg rounded-tl-none bg-white px-3 py-2 shadow-sm relative">
              <div className="mb-1 text-xs font-semibold text-purple-600">
                {msg.customerName}
              </div>

              {msg.messageType === "voice" ? (
                <VoiceBubble
                  message={msg}
                  onUpdateTranscription={onUpdateTranscription}
                />
              ) : (
                <p className="whitespace-pre-wrap text-[15px] text-gray-900 leading-tight">
                  {msg.body}
                </p>
              )}

              {msg.classification && (
                <div className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-600">
                  <span className="font-semibold text-[#075E54]">
                    {msg.classification.mainCategory.name}
                  </span>
                  {msg.classification.subCategory?.name && (
                    <span> / {msg.classification.subCategory.name}</span>
                  )}
                  {msg.classification.productName && (
                    <span> / {msg.classification.productName}</span>
                  )}
                </div>
              )}
              {msg.additionalClassifications?.map((classification, index) => (
                <div key={`${msg.id}-classification-${index}`} className="mt-1 text-xs text-gray-600">
                  <span className="font-semibold text-[#075E54]">{classification.mainCategoryName}</span>
                  {classification.subCategoryName && <span> / {classification.subCategoryName}</span>}
                  {classification.productName && <span> / {classification.productName}</span>}
                </div>
              ))}
              <div className="mt-1 flex justify-end">
                <span className="text-[10px] text-gray-500 uppercase">
                  {formatTime(msg.receivedAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function VoiceBubble({
  message,
  onUpdateTranscription,
}: {
  message: MessageItem;
  onUpdateTranscription?: (id: string, transcription: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Mic className="h-4 w-4 text-[#075E54]" />
        <span className="text-xs text-gray-600">رسالة صوتية</span>
      </div>

      {message.audioPath && (
        <audio controls className="h-8 w-full max-w-xs" src={message.audioPath}>
          <track kind="captions" />
        </audio>
      )}

      {message.transcription ? (
        <p className="text-sm italic text-gray-700">
          « {message.transcription} »
        </p>
      ) : (
        <ManualTranscriptionForm
          messageId={message.id}
          onSave={onUpdateTranscription}
        />
      )}
    </div>
  );
}

function ManualTranscriptionForm({
  messageId,
  onSave,
}: {
  messageId: string;
  onSave?: (id: string, transcription: string) => void;
}) {
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const text = String(fd.get("transcription") || "");
        if (text.trim()) onSave?.(messageId, text.trim());
      }}
    >
      <input
        name="transcription"
        placeholder="أدخل النص يدوياً إذا فشل التفريغ التلقائي"
        className="w-full rounded border px-2 py-1 text-xs"
      />
      <button type="submit" className="text-xs text-[#075E54] hover:underline">
        حفظ وإعادة تصنيف
      </button>
    </form>
  );
}
