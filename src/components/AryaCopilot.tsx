import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ReactMarkdown from 'react-markdown';

type Msg = { role: 'user' | 'assistant'; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/arya-copilot`;

const AryaCopilot = React.forwardRef<HTMLDivElement, object>((_, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Msg = { role: 'user', content: text };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput('');
    setIsLoading(true);

    let assistantSoFar = '';

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: 'assistant', content: assistantSoFar }];
      });
    };

    try {
      console.log('Arya Copilot: Sending request to', CHAT_URL);
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages }),
      });

      console.log('Arya Copilot: Response status', resp.status);

      if (!resp.ok || !resp.body) {
        const errText = await resp.text();
        console.error('Arya Copilot: Error response', resp.status, errText);
        let errMsg = 'Something went wrong. Please try again.';
        try {
          const errData = JSON.parse(errText);
          errMsg = errData.error || errMsg;
        } catch {}
        if (resp.status === 429) errMsg = 'Rate limit exceeded. Please wait a moment.';
        if (resp.status === 402) errMsg = 'AI credits exhausted. Please try later.';
        upsertAssistant(`⚠️ ${errMsg}`);
        setIsLoading(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }
    } catch (err) {
      console.error('Copilot error:', err);
      upsertAssistant('⚠️ Connection error. Please check your internet and try again.');
    }

    setIsLoading(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-[9999] w-14 h-14 rounded-full bg-gradient-to-br from-primary to-purple-600 text-white shadow-2xl shadow-primary/30 flex items-center justify-center hover:scale-110 transition-transform animate-fade-in group"
        style={{ position: 'fixed' }}
        title="Arya Copilot AI"
      >
        <Bot className="w-7 h-7 group-hover:hidden" />
        <Sparkles className="w-7 h-7 hidden group-hover:block animate-pulse" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-[380px] h-[520px] bg-card border border-border rounded-2xl shadow-2xl shadow-black/30 flex flex-col overflow-hidden animate-fade-in" style={{ position: 'fixed' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-primary/20 to-purple-600/20 border-b border-border">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-foreground">Arya Copilot</h3>
          <p className="text-[10px] text-muted-foreground">AI Assistant • Ask anything</p>
        </div>
        <button
          onClick={() => { setMessages([]); }}
          className="text-muted-foreground hover:text-foreground p-1"
          title="Clear chat"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => setIsOpen(false)}
          className="text-muted-foreground hover:text-foreground p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-3">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-purple-600/20 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h4 className="text-foreground font-semibold">Hi! I'm Arya Copilot 🤖</h4>
            <p className="text-xs text-muted-foreground">
              Ask me anything — SQL queries, coding help, debugging, general knowledge, or study topics!
            </p>
            <div className="grid grid-cols-2 gap-2 w-full mt-2">
              {[
                'Write a SQL JOIN query',
                'Explain PRIMARY KEY',
                'Fix my SQL error',
                'What is PostgreSQL?',
              ].map((q, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(q); }}
                  className="text-[11px] text-left px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors border border-border/50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-md'
                  : 'bg-muted text-foreground rounded-bl-md'
              }`}
            >
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm prose-invert max-w-none [&_pre]:bg-background/50 [&_pre]:rounded-lg [&_pre]:p-2 [&_code]:text-xs [&_p]:mb-1 [&_p]:mt-0 [&_ul]:mb-1 [&_ol]:mb-1 [&_li]:mb-0">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Ask Arya Copilot..."
            className="flex-1 bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={isLoading}
          />
          <Button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            size="icon"
            className="rounded-xl bg-gradient-to-br from-primary to-purple-600 hover:opacity-90 shrink-0"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-[9px] text-muted-foreground/50 text-center mt-1.5">Powered by Arya Copilot AI</p>
      </div>
    </div>
  );
});

AryaCopilot.displayName = 'AryaCopilot';

export default AryaCopilot;
