import { useState } from 'react';
import { Send, Bot, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function AIChat() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hola! ¿En qué puedo ayudarte con tus tickets hoy?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Simulate AI response
    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'He analizado tus tickets. Encontré 3 anomalías principales y 12 oportunidades de optimización. ¿Quieres que te genere un informe detallado?'
      }]);
      setIsLoading(false);
    }, 1200);
  };

  return (
    <div className="flex flex-col h-[600px] glass rounded-3xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3">
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="font-semibold">Asistente IA</div>
          <div className="text-xs text-emerald-500 flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> En línea
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <AnimatePresence>
          {messages.map((msg, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] px-5 py-3.5 rounded-3xl ${msg.role === 'user' 
                ? 'bg-indigo-600 text-white' 
                : 'bg-white/5 text-white'}`}>
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" />
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-100" />
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-200" />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/10">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Pregunta sobre tus tickets..."
            className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:border-indigo-500/50"
          />
          <button 
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="px-5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="text-[10px] text-center text-zinc-500 mt-2">Presiona Enter para enviar</div>
      </div>
    </div>
  );
}