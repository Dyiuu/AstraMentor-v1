import { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { api } from './api/client';
import type { GraphData, LearnerState, ChatMessage } from './types';
import KnowledgeGraph from './features/graph/KnowledgeGraph';
import { NodeDetailsModal } from './features/graph/NodeDetailsModal';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ChatInterface from './features/chat/ChatInterface';
import Dashboard from './features/dashboard/Dashboard';
import HomePage from './features/home/HomePage';
import { Button } from './components/ui/button';
import { Search, Loader2, Book, Menu, Sun, Eye, Languages, Code } from 'lucide-react';
import { IDEPanel } from './features/ide/IDEPanel';
import { GenerateGraphDialog } from './features/graph/GenerateGraphDialog';
import { ScrollArea } from './components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable"
import { HistorySidebar, type GraphSession } from './features/sidebar/HistorySidebar';
import { useLanguage } from './contexts/LanguageContext';

// Define session state type
interface NodeSessionState {
  chatMessages: ChatMessage[];
  teachingPlan: string | null;
  isPlanView: boolean;
  showPlanPanel: boolean; 
}

interface FullGraphSession extends GraphSession {
    graphData: GraphData;
    nodeSessions: Record<string, NodeSessionState>;
    learningGoal: string;
    currentLevel: string;
    learnerState: LearnerState | null;
}

function App() {
  const { t, language, setLanguage } = useLanguage();
  // Input Form State
  const [inputTopic, setInputTopic] = useState('');
  const [inputGoal, setInputGoal] = useState('');
  const [inputLevel, setInputLevel] = useState('');

  // Active Session State
  const [currentTopic, setCurrentTopic] = useState('');
  const [currentGoal, setCurrentGoal] = useState('');
  const [currentGraphLevel, setCurrentGraphLevel] = useState('');
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [learnerState, setLearnerState] = useState<LearnerState | null>(null);
  
  // Current Active Node
  const [selectedNode, setSelectedNode] = useState<{ id: string; name: string; attributes?: any } | null>(null);
  
  // Session State Storage (Map of Node ID -> Session State)
  const [nodeSessions, setNodeSessions] = useState<Record<string, NodeSessionState>>({});

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [contextMenuNode, setContextMenuNode] = useState<any | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showLanding, setShowLanding] = useState(!graphData); // Show landing if no graph active

 
  // UI States for Learning Flow
  const [isPlanView, setIsPlanView] = useState(false); // True when showing plan confirmation button
  const [teachingPlan, setTeachingPlan] = useState<string | null>(null); // Stores the plan text
  
  // Panel Visibility States
  const [showPlanPanel, setShowPlanPanel] = useState(true);
  const [showGraphPanel, setShowGraphPanel] = useState(true);
  const [showIDE, setShowIDE] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  // Theme State
  const [theme, setTheme] = useState<'light' | 'eye-care'>('light');
  const [interactionState, setInteractionState] = useState<'chat' | 'confirm_understanding' | 'quiz'>('chat');
  const [currentQuestion, setCurrentQuestion] = useState<string>("");

  // Apply theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('eye-care', 'dark');
    if (theme === 'eye-care') {
      root.classList.add('eye-care');
    }
  }, [theme]);

  // History Sessions
  const [graphSessions, setGraphSessions] = useState<FullGraphSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => Date.now().toString()); // Start with a default ID

  // Load initial state
  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    try {
      const state = await api.getLearnerState();
      setLearnerState(state);
    } catch (error) {
      console.error('Failed to load state:', error);
    }
  };

  const handleNodeContextMenu = (_event: React.MouseEvent, node: any) => {
    setContextMenuNode(node);
  };

  const saveCurrentSession = () => {
      if (!graphData) return;
      
      const session: FullGraphSession = {
          id: currentSessionId,
          topic: currentTopic || "未命名星图",
          date: new Date().toISOString(),
          graphData,
          nodeSessions, // Current node sessions
          learningGoal: currentGoal,
          currentLevel: currentGraphLevel,
          learnerState
      };

      setGraphSessions(prev => {
          // Update existing if exists, or add new
          const existingIndex = prev.findIndex(s => s.id === currentSessionId);
          if (existingIndex >= 0) {
              const newSessions = [...prev];
              newSessions[existingIndex] = session;
              return newSessions;
          }
          return [session, ...prev];
      });
  };

  const handleGenerateGraph = async () => {
    if (!inputTopic.trim()) return;

    if (graphData) {
        saveCurrentSession();
    }

    setIsGenerating(true);
    setIsDialogOpen(false); 
    
    // Create new session ID for the upcoming graph
    const newSessionId = Date.now().toString();
    
    try {
      toast.info('Generating Knowledge Graph...');
      // Use user input for topic, goal, and current level. 
      const data = await api.generateGraph(inputTopic, inputGoal, inputLevel || '零基础', '掌握核心概念');
      
      // Reset state for new graph
      setGraphData(data);
      setNodeSessions({}); // Clear node history
      setSelectedNode(null);
      setChatMessages([]);
      setTeachingPlan(null);
      setCurrentSessionId(newSessionId);
      
      // Update active session metadata
      setCurrentTopic(inputTopic);
      setCurrentGoal(inputGoal);
      setCurrentGraphLevel(inputLevel);

      // Add to history immediately
      const newSession: FullGraphSession = {
          id: newSessionId,
          topic: inputTopic,
          date: new Date().toISOString(),
          graphData: data,
          nodeSessions: {},
          learningGoal: inputGoal,
          currentLevel: inputLevel,
          learnerState: learnerState
      };
      setGraphSessions(prev => [newSession, ...prev]);

      // Switch to main view
      setShowLanding(false);

      toast.success('Knowledge Graph Generated!');
    } catch (error) {
      toast.error('Failed to generate graph');
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLoadSession = (sessionId: string) => {
      if (sessionId === currentSessionId) return;

      // Save current before switching?
      if (graphData) {
          saveCurrentSession();
      }

      const session = graphSessions.find(s => s.id === sessionId);
      if (!session) return;

      // Restore session
      setCurrentSessionId(session.id);
      setCurrentTopic(session.topic);
      setCurrentGoal(session.learningGoal);
      setCurrentGraphLevel(session.currentLevel);
      setGraphData(session.graphData);
      setNodeSessions(session.nodeSessions);
      setLearnerState(session.learnerState);
      
      // Reset View State (start fresh on the graph or restore last node? Session doesn't store last selected node in FullGraphSession interface yet)
      setSelectedNode(null);
      setChatMessages([]);
      setTeachingPlan(null);
      setIsPlanView(false);
      setShowLanding(false); // Switch to main view
      
      // Close sidebar on mobile? optional.
  };

  const handleDeleteSession = (sessionId: string) => {
      console.log('Deleting session:', sessionId, 'Current:', currentSessionId);
      setGraphSessions(prev => prev.filter(s => s.id !== sessionId));
      
      // If deleted session was active, reset state
      if (sessionId === currentSessionId) {
          console.log('Resetting active session state');
          setGraphData(null);
          setNodeSessions({});
          setSelectedNode(null);
          setChatMessages([]);
          setTeachingPlan(null);
          setCurrentTopic('');
          setCurrentGoal('');
          setCurrentGraphLevel('');
          // Generate new ID for potential new session
          setCurrentSessionId(Date.now().toString());
          
          toast.success('已清空并删除当前会话');
      } else {
          toast.success('已删除历史记录');
      }
  };



  const handleNodeClick = (nodeId: string, nodeName: string, attributes: any) => {
    // 1. Save current session state if a node is selected
    if (selectedNode) {
        setNodeSessions(prev => ({
            ...prev,
            [selectedNode.id]: {
                chatMessages,
                teachingPlan,
                isPlanView,
                showPlanPanel 
            }
        }));
    }

    // 2. Switch to new node
    setSelectedNode({ id: nodeId, name: nodeName, attributes });

    // 3. Load saved session state or reset
    if (selectedNode?.id === nodeId) return; 

    const savedSession = nodeSessions[nodeId];

    if (savedSession) {
        setChatMessages(savedSession.chatMessages);
        setTeachingPlan(savedSession.teachingPlan);
        setIsPlanView(savedSession.isPlanView);
    } else {
        // New session
        setChatMessages([]);
        setTeachingPlan(null); // Reset plan
        setIsPlanView(false);
    }
  };

  const handleStartLearning = async () => {
    if (!selectedNode) return;
    
    setIsChatLoading(true);
    try {
      toast.info(`Generating Teaching Plan for ${selectedNode.name}...`);
      const attributes = (selectedNode as any).attributes || {};
      
      const response = await api.startLearning(
          selectedNode.name, 
          attributes.description || '', 
          attributes.user_note || '',
          attributes.weight_A || 0,
          attributes.weight_B || 0.8
      );
      
      // Store the plan
      setTeachingPlan(response.content);
      setShowPlanPanel(true); // Auto-open plan panel
      
      setChatMessages([
        { role: 'assistant', content: response.content }
      ]);
      setIsPlanView(true); // Enable "Start Lesson" button
    } catch (error) {
      toast.error('Failed to generate teaching plan');
      console.error(error);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleConfirmStartLesson = async () => {
    if (!selectedNode) return;
    setIsChatLoading(true);
    try {
        toast.info(`Starting lesson for ${selectedNode.name}...`);
        
        // 1. Start teaching
        const lessonResponse = await api.startLesson(selectedNode.name);
        setChatMessages([
            { role: 'assistant', content: lessonResponse.content }
        ]);

        // 2. Ask for confirmation instead of immediate quiz
        setInteractionState('confirm_understanding');
        setIsPlanView(false); 
    } catch (error) {
        toast.error('Failed to start lesson');
        console.error(error);
    } finally {
        setIsChatLoading(false);
    }
  };

  const handleStartQuiz = async () => {
      if (!selectedNode) return;
      setIsChatLoading(true);
      try {
          const questionResponse = await api.generateQuestion(selectedNode.name);
          setCurrentQuestion(questionResponse.question);
          setChatMessages(prev => [
              ...prev,
              { role: 'assistant', content: `**Quiz Time!** 🧠\n\n${questionResponse.question}` }
          ]);
          setInteractionState('quiz');
      } catch (error) {
          toast.error('Failed to generate quiz');
          console.error(error);
      } finally {
          setIsChatLoading(false);
      }
  };

  const handleExplainAgain = () => {
      const message = "我没太明白，能用更简单的例子再讲一遍吗？";
      handleSendMessage(message); // Reuse chat logic
      // State remains 'confirm_understanding' so buttons persist (or re-appear after response?)
      // distinct from 'chat' mode.
  };

  const updateGraphNodeMastery = (nodeName: string, mastery: number) => {
      setGraphData(prev => {
          if (!prev) return null;
          return {
              ...prev,
              nodes: prev.nodes.map(node => {
                  if (node.name === nodeName) {
                      return {
                          ...node,
                          attributes: {
                              ...node.attributes,
                              weight_A: mastery
                          }
                      };
                  }
                  return node;
              })
          };
      });
  };

  const handleSendMessage = async (message: string, image?: string) => {
    if (!selectedNode) return;

    // Add user message immediately
    const userMessage: ChatMessage = { role: 'user', content: message };
    if (image) {
        userMessage.image = image;
    }
    const newMessages = [...chatMessages, userMessage];
    setChatMessages(newMessages);
    setIsChatLoading(true);

    try {
      if (interactionState === 'quiz') {
          // Quiz Mode: Evaluate Answer
          const evaluation = await api.evaluateAnswer(selectedNode.name, currentQuestion, message);
          
          const feedbackContent = `
**Assessment Result** 📝

*   **Score:** ${Math.round(evaluation.score * 100)}%
*   **Result:** ${evaluation.is_mastered ? "✅ Mastered" : "📚 Keep Learning"}

**Feedback:**
${evaluation.feedback}

**Detailed Analysis:**
${evaluation.analysis}
          `;

          setChatMessages(prev => [
              ...prev,
              { role: 'assistant', content: feedbackContent }
          ]);
          
          setInteractionState('chat');
          
          // Refresh graph and state with NEW MASTERY
          updateGraphNodeMastery(selectedNode.name, evaluation.new_mastery);
          loadState();
          
      } else {
          // Normal Chat Mode
          const history = chatMessages.map(msg => ({
            role: msg.role,
            content: msg.content
          }));

          const response = await api.chat(selectedNode.name, message, history, image);
          setChatMessages(prev => [...prev, { role: 'assistant', content: response.response }]);
      }
    } catch (error) {
      toast.error('Failed to send message');
      console.error(error);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className={showLanding ? "bg-background min-h-screen" : "flex flex-col h-screen bg-background text-foreground relative"}>
       {/* Node Details Modal */ }
       <NodeDetailsModal 
          node={contextMenuNode} 
          isOpen={!!contextMenuNode} 
          onClose={() => setContextMenuNode(null)} 
          onUpdate={() => {
              loadState(); 
          }}
       />

       {showLanding ? (
           <HomePage onStart={() => setShowLanding(false)} />
       ) : (
           <>
              <header className="border-b p-4 flex items-center justify-between bg-background z-10 relative">
                  <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => setShowHistory(!showHistory)} className="mr-1">
                        <Menu className="h-6 w-6" />
                    </Button>
                    
                    <div className="flex items-center gap-4 cursor-pointer" onClick={() => setShowLanding(true)} title="Back to Home">
                        <img src="/logo.png" alt="AstraMentor Logo" className="w-12 h-12 object-contain" />
                        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                          AstraMentor
                        </h1>
                    </div>
                    
                    {/* Panel Toggles */}
                    <div className="flex items-center gap-2 ml-4">
                        <Button 
                            variant="outline"
                            size="icon"
                            onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
                            className="text-muted-foreground hover:text-foreground"
                            title={language === 'zh' ? "Switch to English" : "切换到中文"}
                        >
                            <Languages className="h-4 w-4" />
                        </Button>

                        <Button 
                            variant="outline"
                            size="icon"
                            onClick={() => setTheme(theme === 'light' ? 'eye-care' : 'light')}
                            className={theme === 'eye-care' ? "bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-200" : "text-muted-foreground hover:text-foreground"}
                            title={theme === 'light' ? "开启护眼模式" : "切换回白天模式"}
                        >
                            {theme === 'light' ? <Eye className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                        </Button>

                        {teachingPlan && !isPlanView && (
                            <Button 
                                variant={showPlanPanel ? "default" : "outline"} 
                                size="sm"
                                onClick={() => setShowPlanPanel(!showPlanPanel)}
                                className={showPlanPanel ? "bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200" : "text-muted-foreground"}
                            >
                                <Book className="mr-2 h-4 w-4" />
                                {showPlanPanel ? t('app.hide_plan') : t('app.view_plan')}
                            </Button>
                        )}
                        
                        <Button 
                            variant={showIDE ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                                setShowIDE(!showIDE);
                                if (!showIDE) setShowGraphPanel(false); // Auto-hide graph when opening IDE? Or just overlay?
                                // Let's just let them toggle independently, but IDE takes precedence in view or replaces it.
                                // If I use the same panel, I should probably toggle the other one off or just let the render logic handle it.
                                // Let's keep it simple: IDE button toggles IDE mode.
                            }}
                            className={showIDE ? "bg-green-100 text-green-700 hover:bg-green-200 border-green-200" : "text-muted-foreground"}
                            title="Open Code Editor"
                        >
                            <Code className="mr-2 h-4 w-4" />
                            IDE
                        </Button>

                        <Button 
                            variant={showGraphPanel ? "default" : "outline"}
                            size="sm" 
                            onClick={() => {
                                setShowGraphPanel(!showGraphPanel);
                                if (!showGraphPanel) setShowIDE(false); // Switch back to graph
                            }}
                            className={showGraphPanel ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200" : "text-muted-foreground"}
                        >
                            <Search className="mr-2 h-4 w-4" />
                            {showGraphPanel ? t('app.hide_graph') : t('app.view_graph')}
                        </Button>
                    </div>
                </div>

                <Button onClick={() => setIsDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md">
                    <Search className="mr-2 h-4 w-4" />
                    {t('app.generate_btn')}
                </Button>
              </header>

              <main className="flex-1 flex overflow-hidden">
                {/* History Sidebar */}
                <HistorySidebar 
                    isOpen={showHistory} 
                    sessions={graphSessions} 
                    currentSessionId={currentSessionId}
                    onSelectSession={handleLoadSession}
                    onDeleteSession={handleDeleteSession}
                    onClose={() => setShowHistory(false)}
                />

                <div className="flex-1 flex overflow-hidden">
                    <ResizablePanelGroup orientation="horizontal">
                        
                        {!isPlanView && teachingPlan && showPlanPanel && (
                            <>
                                <ResizablePanel defaultSize="25" minSize="10" maxSize="80" className="bg-muted/30 flex flex-col">
                                    <div className="h-full p-4 flex flex-col gap-4 animate-in slide-in-from-left-5 duration-300">
                                        <Card className="h-full flex flex-col border-border bg-card/60 shadow-sm">
                                            <CardHeader className="py-3 px-4 border-b bg-muted/20">
                                                <CardTitle className="text-sm font-medium flex items-center gap-2 text-primary">
                                                    <Book className="w-4 h-4" />
                                                    {t('app.current_plan')}
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-0 flex-1 overflow-hidden">
                                                <ScrollArea className="h-full p-4">
                                                    <div className="text-sm text-foreground leading-relaxed">
                                                        <ReactMarkdown 
                                                            remarkPlugins={[remarkGfm]}
                                                            components={{
                                                                ul: ({node, ...props}) => <ul className="list-disc pl-8 my-2" {...props} />,
                                                                ol: ({node, ...props}) => <ol className="list-decimal pl-8 my-2" {...props} />,
                                                                h1: ({node, ...props}) => <h1 className="text-xl font-bold my-2" {...props} />,
                                                                h2: ({node, ...props}) => <h2 className="text-lg font-bold my-2" {...props} />,
                                                                h3: ({node, ...props}) => <h3 className="text-base font-bold my-1" {...props} />,
                                                                a: ({node, ...props}) => <a className="text-blue-500 hover:underline" {...props} />,
                                                                blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-gray-300 pl-4 italic my-2" {...props} />,
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
                                                                        <code className="bg-muted px-1 rounded font-mono text-xs" {...props}>
                                                                            {children}
                                                                        </code>
                                                                    );
                                                                },
                                                            }}
                                                        >
                                                            {teachingPlan}
                                                        </ReactMarkdown>
                                                    </div>
                                                </ScrollArea>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </ResizablePanel>
                                <ResizableHandle withHandle />
                            </>
                        )}

                        <ResizablePanel defaultSize={teachingPlan && !isPlanView ? "35" : "40"} minSize="10" className="bg-muted/30 flex flex-col">
                            <div className="h-full p-4 flex flex-col gap-4">
                                <div className="flex-1 min-h-0">
                                    {selectedNode && chatMessages.length === 0 && !teachingPlan ? (
                                        <div className="flex flex-col items-center justify-center h-full text-center space-y-4 p-6 bg-card rounded-lg border shadow-sm">
                                            <h3 className="text-lg font-semibold">{t('app.confirm_learning', { topic: selectedNode.name })}</h3>
                                            <p className="text-sm text-muted-foreground">
                                            {t('app.start_learning_desc')}
                                            </p>
                                            <Button onClick={handleStartLearning} disabled={isChatLoading}>
                                            {isChatLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            {t('app.start_learning_btn')}
                                            </Button>
                                        </div>
                                    ) : (
                                        <ChatInterface 
                                            messages={chatMessages} 
                                            onSendMessage={handleSendMessage}
                                            currentNodeName={selectedNode?.name || null}
                                            isLoading={isChatLoading}
                                            showStartLesson={isPlanView}
                                            onStartLesson={handleConfirmStartLesson}
                                            interactionState={interactionState}
                                            onStartQuiz={handleStartQuiz}
                                            onExplainAgain={handleExplainAgain}
                                        />
                                    )}
                                </div>
                            </div>
                        </ResizablePanel>
                        
                        
                        {(showGraphPanel || showIDE) && (
                            <>
                                <ResizableHandle withHandle />
                                <ResizablePanel defaultSize={teachingPlan && !isPlanView ? "40" : "60"} minSize="10">
                                    {showIDE ? (
                                        <IDEPanel />
                                    ) : (
                                        <div className="h-full relative bg-background">
                                            <KnowledgeGraph 
                                                data={graphData} 
                                                onNodeClick={handleNodeClick} 
                                                onNodeContextMenu={handleNodeContextMenu}
                                                theme={theme}
                                            />
                                            <div className="absolute top-4 left-4 z-10 w-auto">
                                                <Dashboard state={learnerState} graphData={graphData} />
                                            </div>
                                            {!graphData && !isGenerating && (
                                                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                                                {t('graph.enter_topic')}
                                                </div>
                                            )}
                                            {isGenerating && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-50">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                                        <p>{t('graph.generating')}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </ResizablePanel>
                            </>
                        )}
                    </ResizablePanelGroup>
                </div>
              </main>
           </>
       )}
       
       <GenerateGraphDialog 
          open={isDialogOpen} 
          onOpenChange={setIsDialogOpen}
          inputTopic={inputTopic}
          setInputTopic={setInputTopic}
          inputLevel={inputLevel}
          setInputLevel={setInputLevel}
          inputGoal={inputGoal}
          setInputGoal={setInputGoal}
          isGenerating={isGenerating}
          onGenerate={handleGenerateGraph}
          t={t}
       />
       <Toaster />
    </div>
  );
}

export default App;
