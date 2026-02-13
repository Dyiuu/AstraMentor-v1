import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import type { ChatMessage } from '../../types';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Send, BookOpen, X, Paperclip } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (message: string, image?: string) => void;
  currentNodeName: string | null;
  isLoading: boolean;
  showStartLesson?: boolean;
  onStartLesson?: () => void;
  
  // New props for feedback flow
  interactionState?: 'chat' | 'confirm_understanding' | 'quiz';
  onExplainAgain?: () => void;
  onStartQuiz?: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
    messages, 
    onSendMessage, 
    currentNodeName,
    isLoading,
    showStartLesson,
    onStartLesson,
    interactionState = 'chat',
    onExplainAgain,
    onStartQuiz
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((input.trim() || selectedImage) && !isLoading) {
      onSendMessage(input, selectedImage || undefined);
      setInput('');
      setSelectedImage(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <Card className="flex flex-col h-full shadow-md rounded-lg overflow-hidden border-border bg-card">
      <CardHeader className="border-b bg-muted/40 py-3">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <BookOpen className="w-5 h-5 text-primary" />
          {currentNodeName ? t('chat.learning', {node: currentNodeName}) : t('chat.ai_tutor')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0 bg-background relative">
        <ScrollArea className="h-full p-4">
          <div className="flex flex-col gap-4 pb-4">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex gap-3 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-none'
                      : 'bg-muted/50 border border-border/50 text-foreground rounded-tl-none'
                  }`}
                >
                  <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                    <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                            ul: ({node, ...props}) => <ul className="list-disc pl-8 my-2 space-y-1" {...props} />,
                            ol: ({node, ...props}) => <ol className="list-decimal pl-8 my-2 space-y-1" {...props} />,
                            h1: ({node, ...props}) => <h1 className="text-xl font-bold my-2" {...props} />,
                            h2: ({node, ...props}) => <h2 className="text-lg font-bold my-2" {...props} />,
                            h3: ({node, ...props}) => <h3 className="text-base font-bold my-1" {...props} />,
                            a: ({node, ...props}) => <a className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors" target="_blank" rel="noopener noreferrer" {...props} />,
                            blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-primary/30 pl-4 italic my-2 text-muted-foreground" {...props} />,
                            p: ({node, ...props}) => <p className="leading-relaxed mb-2 last:mb-0" {...props} />,
                            code: ({node, inline, className, children, ...props}: any) => {
                                const match = /language-(\w+)/.exec(className || '');
                                return !inline && match ? (
                                    <SyntaxHighlighter
                                        {...props}
                                        style={vscDarkPlus}
                                        language={match[1]}
                                        PreTag="div"
                                    >
                                        {String(children).replace(/\n$/, '')}
                                    </SyntaxHighlighter>
                                ) : (
                                    <code className={`${className} bg-muted px-1.5 py-0.5 rounded text-sm font-mono`} {...props}>
                                        {children}
                                    </code>
                                );
                            },
                        }}
                    >
                        {msg.content}
                    </ReactMarkdown>
                    {msg.image && (
                      <div className="mt-2">
                        <img 
                          src={msg.image} 
                          alt="Sent image" 
                          className="max-w-full rounded-md border shadow-sm max-h-60 object-contain" 
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
             {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-2 shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce"></span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Teaching Flow Actions */}
            {showStartLesson && onStartLesson && !isLoading && (
                <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                     <Button 
                        onClick={onStartLesson} 
                        className="bg-green-600 hover:bg-green-700 text-white shadow-sm flex items-center gap-2"
                    >
                        <BookOpen className="w-4 h-4" />
                        {t('chat.start_lesson')}
                    </Button>
                </div>
            )}

            {/* Post-Teaching Feedback Actions */}
             {interactionState === 'confirm_understanding' && !isLoading && (
                 <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300 gap-3 mt-2">
                     <Button 
                         variant="outline"
                         onClick={onExplainAgain}
                         className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                     >
                         🤔 没明白，再讲一遍
                     </Button>
                     <Button 
                         onClick={onStartQuiz}
                         className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                     >
                         ✅ 明白，开始检测
                     </Button>
                 </div>
             )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="border-t p-4 flex-col gap-2 bg-background">
        {selectedImage && (
          <div className="relative w-full flex justify-start animate-in fade-in zoom-in duration-200">
            <div className="relative group">
              <img src={selectedImage} alt="Preview" className="h-20 rounded-md object-cover border shadow-sm" />
              <button 
                onClick={handleRemoveImage}
                className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1.5 w-6 h-6 flex items-center justify-center cursor-pointer shadow-md hover:bg-destructive/90 transition-colors opacity-0 group-hover:opacity-100"
                type="button"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex w-full gap-2 items-center">
             <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleImageSelect}
              />
          <Button 
            type="button" 
            variant="outline" 
            size="icon" 
            onClick={() => fileInputRef.current?.click()}
            disabled={!currentNodeName || isLoading}
            title={t('chat.upload_image')}
            className="shrink-0"
           >
            <Paperclip className="w-4 h-4" />
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={currentNodeName ? t('chat.placeholder') : t('chat.select_node')}
            disabled={!currentNodeName || isLoading}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={(!currentNodeName || isLoading) || (!input.trim() && !selectedImage)} title={t('chat.send')} className="shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
};

export default ChatInterface;
