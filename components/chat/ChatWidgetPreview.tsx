"use client";

import { useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const placeholderMessages: Message[] = [
  {
    id: "1",
    role: "assistant",
    content: "Hey there! How can I help you today?"
  },
  {
    id: "2",
    role: "user",
    content: "Can you tell me more about your AI chat solution?"
  },
  {
    id: "3",
    role: "assistant",
    content: "Absolutely! Our system connects OpenAI, Twilio, SendGrid, and Stripe."
  }
];

export default function ChatWidgetPreview() {
  const [messages, setMessages] = useState<Message[]>(placeholderMessages);
  const [input, setInput] = useState("");

  function handleSend() {
    if (!input.trim()) return;
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: input.trim() }
    ]);
    setInput("");
  }

  return (
    <div className="flex h-96 flex-col rounded-2xl bg-slate-950/80 shadow-lg ring-1 ring-slate-800">
      <header className="flex items-center gap-2 rounded-t-2xl border-b border-slate-800 bg-slate-900 px-4 py-3">
        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
        <p className="text-sm font-medium text-white">AI Assistant</p>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[80%] rounded-xl px-4 py-2 text-sm ${
              message.role === "assistant"
                ? "self-start bg-slate-800 text-slate-100"
                : "self-end bg-indigo-500 text-white"
            }`}
          >
            {message.content}
          </div>
        ))}
      </div>
      <footer className="flex items-center gap-2 border-t border-slate-800 bg-slate-900 px-4 py-3">
        <input
          className="flex-1 rounded-full border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          placeholder="Type a question..."
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          className="rounded-full bg-indigo-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
          type="button"
          onClick={handleSend}
        >
          Send
        </button>
      </footer>
    </div>
  );
}

