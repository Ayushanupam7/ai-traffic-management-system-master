"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatWidget() {
  const [open, setOpen]       = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(promptOverride?: string) {
    const text = (promptOverride ?? input).trim();
    if (!text || loading) return;

    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const data = await api.sendChat(next);
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Could not reach the backend." }]);
    } finally {
      setLoading(false);
    }
  }

  // Three demo-friendly preset prompts shown when the conversation is
  // fresh. Clicking one fires `send(text)` directly so the user doesn't
  // have to type anything to see the model in action.
  const PRESET_PROMPTS = [
    "Which signal is most congested right now?",
    "What's the throughput trend?",
    "Suggest a policy tweak for the current run",
  ];

  return (
    <div className="absolute bottom-4 right-4 z-20 flex flex-col items-end gap-2">

      {/* Chat panel */}
      {open && (
        <div className="w-80 h-[420px] flex flex-col bg-[#0d1117] border border-gray-800
                        rounded-xl shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2
                          bg-[#111827] border-b border-gray-800">
            <span className="text-[11px] font-semibold text-gray-300 tracking-wide">
              AI Traffic Assistant
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-600 hover:text-gray-400 text-xs leading-none"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
            {messages.length === 0 && (
              <>
                <p className="text-[11px] text-gray-600 text-center mt-6 mb-3">
                  Ask me about live traffic conditions,<br />metrics, or signal states.
                </p>
                <div className="flex flex-col gap-1.5 mt-1">
                  {PRESET_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => send(p)}
                      disabled={loading}
                      className="text-left text-[10.5px] bg-[#1f2937] hover:bg-[#27324a]
                                 border border-gray-700 rounded-md px-2.5 py-1.5
                                 text-gray-300 disabled:opacity-40 transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
                    m.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-[#1f2937] text-gray-300"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[#1f2937] rounded-lg px-3 py-2 text-[11px] text-gray-500">
                  <span className="animate-pulse">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-2 border-t border-gray-800 flex gap-2">
            <input
              className="flex-1 bg-[#1f2937] border border-gray-700 rounded-md px-2 py-1.5
                         text-[11px] text-gray-200 placeholder-gray-600 outline-none
                         focus:border-blue-600"
              placeholder="Ask about traffic…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              disabled={loading}
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                         rounded-md text-[11px] text-white font-medium transition-colors"
            >
              ↑
            </button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 shadow-lg
                   flex items-center justify-center text-lg transition-colors"
        title="AI Traffic Assistant"
      >
        {open ? "✕" : "💬"}
      </button>
    </div>
  );
}
