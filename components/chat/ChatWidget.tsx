"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import clsx from "clsx";

type ChatPosition = "bottom-right" | "bottom-left";

interface ChatWidgetProps {
  dealershipName: string;
  dealershipId?: string;
  logoSrc?: string;
  position?: ChatPosition;
  placeholder?: string;
  onSendMessage?: (message: string) => Promise<string> | string | void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

export default function ChatWidget({
  dealershipName,
  dealershipId,
  logoSrc,
  position = "bottom-right",
  placeholder = "Type your message...",
  onSendMessage
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `Hi there! I'm the AI assistant for ${dealershipName}. How can I help you today?`,
      createdAt: new Date()
    }
  ]);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages, isOpen, isTyping]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.parent === window) return;
    window.parent.postMessage(
      {
        source: "dealerchat-widget",
        type: "state-change",
        open: isOpen
      },
      "*"
    );
  }, [isOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.parent === window) return;
    window.parent.postMessage(
      {
        source: "dealerchat-widget",
        type: "ready"
      },
      "*"
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.parent === window) return;
    if (!dealershipId) return;
    window.parent.postMessage(
      {
        source: "dealerchat-widget",
        type: "dealership",
        dealershipId
      },
      "*"
    );
  }, [dealershipId]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: new Date()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");

    setIsTyping(true);
    try {
      const response = await resolveAssistantResponse(text);
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response,
        createdAt: new Date()
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const resolveAssistantResponse = async (input: string) => {
    if (!onSendMessage) {
      return defaultResponder(input, dealershipName);
    }
    const result = await onSendMessage(input);
    return typeof result === "string" && result.length > 0
      ? result
      : "Thanks! A team member will follow up shortly.";
  };

  const widgetPositionClasses = useMemo(() => {
    switch (position) {
      case "bottom-left":
        return "left-4 sm:left-8";
      case "bottom-right":
      default:
        return "right-4 sm:right-8";
    }
  }, [position]);

  return (
    <div
      className={clsx(
        "fixed z-50 flex flex-col items-end gap-3",
        widgetPositionClasses,
        "bottom-4 sm:bottom-8"
      )}
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={clsx(
              "flex h-[calc(100vh-3.5rem)] w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-950 shadow-2xl shadow-black/40 backdrop-blur",
              "sm:h-[600px] sm:w-[400px]"
            )}
          >
            <header className="flex items-center justify-between gap-3 bg-gradient-to-r from-slate-900 via-slate-900/80 to-slate-950 px-5 py-4">
              <div className="flex items-center gap-3">
                {logoSrc ? (
                  <div className="relative h-10 w-10 overflow-hidden rounded-full bg-slate-800/60 ring-1 ring-slate-700/60">
                    <Image
                      src={logoSrc}
                      fill
                      alt={`${dealershipName} logo`}
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/90 text-lg font-semibold text-white">
                    {dealershipName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium tracking-wide text-white">
                    {dealershipName}
                  </p>
                  <p className="text-xs text-slate-400">
                    Typically replies in under 2 minutes
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggle}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800/70 text-slate-300 transition hover:bg-slate-700 hover:text-white"
                  aria-label="Minimize chat"
                >
                  <span className="text-lg leading-none">—</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800/70 text-slate-300 transition hover:bg-slate-700 hover:text-white"
                  aria-label="Close chat"
                >
                  <span className="text-lg leading-none">&times;</span>
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-hidden">
              <div
                ref={listRef}
                className="flex h-full flex-col gap-3 overflow-y-auto bg-slate-950/90 px-5 py-4"
              >
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                <AnimatePresence>
                  {isTyping && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2 }}
                      className="flex max-w-[80%] items-end gap-2"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white">
                        AI
                      </div>
                      <div className="flex h-9 items-center gap-1 rounded-2xl bg-slate-800/80 px-3 text-white">
                        {[0, 1, 2].map((index) => (
                          <motion.span
                            key={index}
                            className="text-lg leading-none"
                            animate={{
                              opacity: [0.2, 1, 0.2],
                              y: [0, -2, 0]
                            }}
                            transition={{
                              duration: 0.8,
                              repeat: Infinity,
                              delay: index * 0.15
                            }}
                          >
                            •
                          </motion.span>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <footer className="border-t border-slate-800/80 bg-slate-900/70 px-5 py-4">
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/80 px-4 py-3 shadow-inner shadow-black/40">
                <textarea
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  rows={2}
                  placeholder={placeholder}
                  className="w-full resize-none border-none bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">
                    Powered by DealerChat AI
                  </p>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={isTyping || inputValue.trim().length === 0}
                    className="inline-flex min-w-[88px] items-center justify-center rounded-full bg-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:shadow-none"
                  >
                    {isTyping ? "Waiting..." : "Send"}
                  </button>
                </div>
              </div>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={handleToggle}
        className={clsx(
          "group flex items-center gap-3 rounded-full bg-indigo-500/95 px-4 py-3 text-white shadow-xl shadow-indigo-500/40 transition hover:bg-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:px-5",
          isOpen ? "pointer-events-none opacity-0" : "opacity-100"
        )}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        {logoSrc ? (
          <div className="relative h-9 w-9 overflow-hidden rounded-full bg-indigo-400/40">
            <Image src={logoSrc} alt={`${dealershipName} logo`} fill className="object-cover" />
          </div>
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-400/40 text-base font-semibold">
            {dealershipName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex flex-col text-left">
          <span className="text-xs uppercase tracking-wide text-indigo-100/80">
            Questions?
          </span>
          <span className="text-sm font-semibold">Chat with us</span>
        </div>
      </button>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={clsx(
        "flex w-full items-end gap-2",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white">
          AI
        </div>
      )}
      <div
        className={clsx(
          "max-w-[80%] rounded-3xl px-4 py-2 text-sm shadow",
          isUser
            ? "rounded-br-md bg-indigo-500 text-white shadow-indigo-500/30"
            : "rounded-bl-md bg-slate-800/80 text-slate-100 shadow-black/30"
        )}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        <span
          className={clsx(
            "mt-1 block text-[10px] uppercase tracking-wide",
            isUser ? "text-indigo-100/70" : "text-slate-400/70"
          )}
        >
          {format(message.createdAt, "HH:mm")}
        </span>
      </div>
    </div>
  );
}

function defaultResponder(input: string, dealershipName: string) {
  if (/test drive/i.test(input)) {
    return "I'd be happy to help schedule a test drive. What day works best for you?";
  }

  if (/price|cost/i.test(input)) {
    return "Our sales team will share personalized pricing shortly. Do you have a specific vehicle in mind?";
  }

  if (/hours|open|close/i.test(input)) {
    return "We're open Monday–Saturday 9am–7pm and Sunday 11am–5pm.";
  }

  return `Thanks for reaching out to ${dealershipName}! A team member will follow up shortly.`;
}

