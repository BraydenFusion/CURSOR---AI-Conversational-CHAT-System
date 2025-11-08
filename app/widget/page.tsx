"use client";

import ChatWidgetPreview from "@/components/chat/ChatWidgetPreview";

export default function WidgetPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-black/40">
        <h1 className="text-3xl font-semibold text-white">Chat Widget Preview</h1>
        <p className="mt-2 text-sm text-slate-400">
          Embed this widget in any site to power conversational AI experiences.
        </p>
        <div className="mt-6">
          <ChatWidgetPreview />
        </div>
      </div>
    </main>
  );
}

