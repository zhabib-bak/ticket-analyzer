import { AppLayout } from "@/components/layout";
import { useAiChat, useListConversations, getListConversationsQueryKey } from "@workspace/api-client-react";
import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Bot, User, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import type { ChatMessage } from "@workspace/api-client-react/src/generated/api.schemas";

export default function AiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const chatMutation = useAiChat();
  const { data: conversations } = useListConversations();
  const { toast } = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatMutation.isPending]);

  const handleSend = async (question: string = input) => {
    if (!question.trim()) return;
    
    const userMsg: ChatMessage = { role: "user", content: question };
    setMessages(prev => [...prev, userMsg]);
    setInput("");

    try {
      const res = await chatMutation.mutateAsync({
        data: {
          question,
          conversation_id: conversationId,
        }
      });
      
      setConversationId(res.conversation_id);
      setMessages(prev => [...prev, { role: "assistant", content: res.answer }]);
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
    } catch (err) {
      toast({ title: "Error", description: "Failed to send message", variant: "destructive" });
    }
  };

  const suggestions = [
    "What are the top recurring issues?",
    "Summarize the recent P1 tickets.",
    "Which assignee has the most overdue tickets?",
  ];

  return (
    <AppLayout>
      <div className="flex h-full">
        {/* Sidebar history */}
        <div className="w-64 border-r border-border bg-card/50 flex flex-col hidden md:flex">
          <div className="p-4 border-b border-border font-medium text-sm text-muted-foreground">
            Recent Chats
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {conversations?.map(conv => (
              <div key={conv.id} className="p-2 text-sm rounded hover:bg-secondary cursor-pointer text-muted-foreground truncate" onClick={() => setConversationId(conv.id)}>
                {conv.last_question || "New Conversation"}
              </div>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col relative">
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">How can I help analyze your tickets?</h2>
                  <p className="text-muted-foreground text-sm max-w-md mt-2">Ask natural language questions about patterns, outliers, or metrics from your uploaded CSVs.</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 mt-8 max-w-2xl">
                  {suggestions.map(s => (
                    <Button key={s} variant="outline" className="text-xs" onClick={() => handleSend(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`flex gap-4 max-w-4xl mx-auto ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div className={`p-4 rounded-xl max-w-[80%] text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border text-card-foreground"}`}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))
            )}
            
            {chatMutation.isPending && (
              <div className="flex gap-4 max-w-4xl mx-auto justify-start">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce"></div>
                  <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:0.2s]"></div>
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:0.4s]"></div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="p-4 bg-background border-t border-border">
            <div className="max-w-4xl mx-auto relative flex items-center">
              <Input 
                value={input} 
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="Ask about your tickets..." 
                className="pr-12 py-6 text-base bg-card border-border shadow-sm focus-visible:ring-primary/20"
              />
              <Button size="icon" className="absolute right-2" disabled={!input.trim() || chatMutation.isPending} onClick={() => handleSend()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}