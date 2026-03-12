import { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { api } from './api/client';
import type { GraphData, LearnerState, ChatMessage } from './types';
import KnowledgeGraph from './features/graph/KnowledgeGraph';
import { NodeDetailsModal } from './features/graph/NodeDetailsModal';
import { AddNodeDialog } from './features/graph/AddNodeDialog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ChatInterface from './features/chat/ChatInterface';
import Dashboard from './features/dashboard/Dashboard';
import HomePage from './features/home/HomePage';
import { Button } from './components/ui/button';
import { Search, Loader2, Book, Menu, Sun, BookOpen, Code, Sparkles, Plus } from 'lucide-react';
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
  lessonStarted: boolean;
}

interface FullGraphSession extends GraphSession {
    graphData: GraphData;
    nodeSessions: Record<string, NodeSessionState>;
    learningGoal: string;
    currentLevel: string;
    learnerState: LearnerState | null;
    // NOTE: 内部主题 ID，主题模式为主题名，文档模式为 doc_{hash}
    internalTopic?: string;
    // NOTE: 项目模式下保存项目描述
    projectMode?: boolean;
    projectDescription?: string;
}

function App() {
  const { t, language, setLanguage } = useLanguage();
  // Input Form State
  const [inputTopic, setInputTopic] = useState('');
  const [inputGoal, setInputGoal] = useState('');
  const [inputComplexity, setInputComplexity] = useState(2);
  const [inputLevel, setInputLevel] = useState('');

  // Active Session State
  const [currentTopic, setCurrentTopic] = useState('');
  const [currentGoal, setCurrentGoal] = useState('');
  const [currentGraphLevel, setCurrentGraphLevel] = useState('');
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [learnerState, setLearnerState] = useState<LearnerState | null>(null);
  const [graphViewMode, setGraphViewMode] = useState<'2d' | '3d'>('2d');

  // Current Active Node
  const [selectedNode, setSelectedNode] = useState<{ id: string; name: string; attributes?: any } | null>(null);
  
  // Session State Storage (Map of Node ID -> Session State)
  const [nodeSessions, setNodeSessions] = useState<Record<string, NodeSessionState>>({});

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [contextMenuNode, setContextMenuNode] = useState<any | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // whether the lesson has actually started for the current node; used to stop regenerating plans
  const [lessonStarted, setLessonStarted] = useState(false);
  const [isAddNodeDialogOpen, setIsAddNodeDialogOpen] = useState(false);
  const [isAddingNode, setIsAddingNode] = useState(false);
  const [showLanding, setShowLanding] = useState(!graphData); // Show landing if no graph active

  // ======== 文档模式状态 ========
  const [docMode, setDocMode] = useState(false);       // 是否处于文档模式
  const [docId, setDocId] = useState('');               // 当前文档 ID
  const [docFilename, setDocFilename] = useState('');   // 当前文档文件名
  const [isDocUploading, setIsDocUploading] = useState(false);

  // ======== 项目模式状态 ========
  const [projectMode, setProjectMode] = useState(false);
  const [projectDescription, setProjectDescription] = useState('');
  const [inputProjectDesc, setInputProjectDesc] = useState('');

 
  // UI States for Learning Flow
  const [isPlanView, setIsPlanView] = useState(false); // True when showing plan confirmation button
  const [teachingPlan, setTeachingPlan] = useState<string | null>(null); // Stores the plan text
  
  // Panel Visibility States
  const [showPlanPanel, setShowPlanPanel] = useState(true);
  const [showGraphPanel, setShowGraphPanel] = useState(true);
  const [showIDE, setShowIDE] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [previousGraphState, setPreviousGraphState] = useState(true);
  
  // Theme State
  const [theme, setTheme] = useState<'light' | 'eye-care'>('light');
  const [interactionState, setInteractionState] = useState<'chat' | 'confirm_understanding' | 'quiz' | 'step_taught' | 'step_evaluated'>('chat');
  const [currentQuestion, setCurrentQuestion] = useState<string>("");
  // NOTE: step progress tracking and last evaluation analysis
  const [stepProgress, setStepProgress] = useState<{ current: number; total: number } | null>(null);
  const [lastEvalAnalysis, setLastEvalAnalysis] = useState<string>('');

  // Apply theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('eye-care', 'dark');
    // NOTE: 强制主页始终使用纯净的白天模式，不随子页的主题状态变化
    if (!showLanding && theme === 'eye-care') {
      root.classList.add('eye-care');
    }
  }, [theme, showLanding]);

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

  /**
   * 删除星图节点及其关联边
   * NOTE: 同步更新前端状态，并调用后端 API 将变更持久化到磁盘 JSON 文件
   */
  const handleDeleteNode = async (nodeId: string) => {
    if (!graphData) return;

    // 先计算删除后的数据，同时用于前端状态更新和后端持久化
    const updatedNodes = graphData.nodes.filter(n => n.id !== nodeId);
    const updatedLinks = graphData.links.filter(l => l.source !== nodeId && l.target !== nodeId);
    const updatedGraphData = { ...graphData, nodes: updatedNodes, links: updatedLinks };

    // 更新前端显示
    setGraphData(updatedGraphData);

    // 如果删除的是当前选中节点，清除选中状态
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
      setChatMessages([]);
      setTeachingPlan(null);
      setIsPlanView(false);
    }

    // 移除该节点的会话记录
    setNodeSessions(prev => {
      const next = { ...prev };
      delete next[nodeId];
      return next;
    });

    // 同步更新 graphSessions 历史数据
    setGraphSessions(prev =>
      prev.map(s => {
        if (s.id !== currentSessionId) return s;
        return {
          ...s,
          graphData: updatedGraphData,
          averageMastery: calculateAverageMastery(updatedNodes),
        };
      })
    );

    // 持久化到磁盘 JSON 文件
    if (currentTopic) {
      try {
        await api.saveGraph(currentTopic, updatedGraphData);
      } catch (error) {
        console.error('Failed to save graph to disk:', error);
      }
    }

    toast.success(t('node_modal.delete_success'));
  };

  const calculateAverageMastery = (nodes: any[]): number => {
      if (!nodes || nodes.length === 0) return 0;
      const totalMastery = nodes.reduce((sum, node) => sum + (node.attributes?.weight_A || 0), 0);
      return totalMastery / nodes.length;
  };

  /**
   * 更新星图节点数据
   * NOTE: 同步更新前端状态，并调用后端 API 将变更持久化到磁盘 JSON 文件
   */
  const handleUpdateNode = async (updatedData: any) => {
    if (!graphData || !contextMenuNode) return;
    
    // 更新本地 graphData 状态
    const updatedNodes = graphData.nodes.map(n => {
       if (n.id === contextMenuNode.id) {
           return {
               ...n,
               weight_A: updatedData.weight_A,
               weight_B: updatedData.weight_B,
               user_note: updatedData.user_note,
               attributes: {
                 ...n.attributes,
                 weight_A: updatedData.weight_A,
                 weight_B: updatedData.weight_B,
                 user_note: updatedData.user_note
               }
           };
       }
       return n;
    });
    
    const updatedGraphData = { ...graphData, nodes: updatedNodes };
    
    // 立即更新前端显示
    setGraphData(updatedGraphData);
    
    // 重新加载学习状态数据，以刷新进度指示器等信息
    await loadState();

    // 如果当前有主题，持久化保存至后端 JSON
    if (currentTopic) {
        try {
            await api.saveGraph(currentTopic, updatedGraphData);
            // 同步历史会话列表中的数据
            setGraphSessions(prev =>
              prev.map(session => {
                 if (session.id === currentSessionId) {
                    return { ...session, graphData: updatedGraphData, averageMastery: calculateAverageMastery(updatedNodes) };
                 }
                 return session;
              })
            );
        } catch (e) {
            console.error("Failed to persist graph data after node update:", e);
        }
    }
  };

  const saveCurrentSession = () => {
      if (!graphData) return;

      // NOTE: 将当前正在查看的节点的对话状态合并到 nodeSessions 快照中，
      // 避免切换星图后当前节点的聊天记录丢失
      let mergedNodeSessions = { ...nodeSessions };
      if (selectedNode) {
          mergedNodeSessions[selectedNode.id] = {
              chatMessages,
              teachingPlan,
              isPlanView,
              showPlanPanel,
              lessonStarted
          };
      }
      
      // NOTE: 文档模式下 currentTopic 是内部 ID（doc_xxx），侧边栏应显示文件名
      const existingSession = graphSessions.find(s => s.id === currentSessionId);
      const displayTopic = existingSession?.topic
        || (docMode && docFilename ? `📄 ${docFilename}` : '')
        || (projectMode && projectDescription
           ? `🚀 ${(graphData as any)?.graph?.topic || projectDescription.slice(0, 20)}`
           : '')
        || currentTopic
        || "未命名星图";

      const session: FullGraphSession = {
          id: currentSessionId,
          topic: displayTopic,
          internalTopic: currentTopic,
          date: new Date().toISOString(),
          graphData,
          nodeSessions: mergedNodeSessions,
          learningGoal: currentGoal,
          currentLevel: currentGraphLevel,
          learnerState,
          averageMastery: calculateAverageMastery(graphData.nodes),
          projectMode,
          projectDescription,
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
      const data = await api.generateGraph(inputTopic, inputGoal, inputLevel || '零基础', '掌握核心概念', inputComplexity);
      
      // Reset state for new graph
      setGraphData(data);
      setNodeSessions({}); // Clear node history
      setSelectedNode(null);
      setChatMessages([]);
      setTeachingPlan(null);
      setCurrentSessionId(newSessionId);
      // NOTE: 主题模式生成时必须清除文档模式和项目模式状态，避免串台
      setDocMode(false);
      setDocId('');
      setDocFilename('');
      setProjectMode(false);
      setProjectDescription('');
      
      // Update active session metadata
      setCurrentTopic(inputTopic);
      setCurrentGoal(inputGoal);
      setCurrentGraphLevel(inputLevel);

      // Add to history immediately
      const newSession: FullGraphSession = {
          id: newSessionId,
          topic: inputTopic,
          internalTopic: inputTopic,
          date: new Date().toISOString(),
          graphData: data,
          nodeSessions: {},
          learningGoal: inputGoal,
          currentLevel: inputLevel,
          learnerState: learnerState,
          averageMastery: calculateAverageMastery(data.nodes)
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
      // NOTE: 清空对话框输入，避免下次打开残留旧值
      setInputTopic('');
      setInputLevel('');
      setInputGoal('');
    }
  };

  /**
   * 文档模式：上传 PDF 并生成星图
   * NOTE: 先上传解析，再调用文档星图 Agent 生成
   */
  const handleUploadAndGenerate = async (file: File, complexity: number, _level: string = '', _goal: string = '') => {
    if (graphData) saveCurrentSession();

    setIsDocUploading(true);
    setIsDialogOpen(false);
    const newSessionId = Date.now().toString();

    try {
      // 第一步：上传并解析
      toast.info(t('doc.uploading'));
      const uploadResult = await api.uploadDocument(file);
      toast.success(`${t('doc.upload_success')}: ${uploadResult.total_pages} 页, ${uploadResult.chunk_count} 个知识块`);

      // 第二步：生成星图
      setIsDocUploading(false);
      setIsGenerating(true);
      toast.info(t('doc.generating_graph'));
      const data = await api.generateDocGraph(uploadResult.doc_id, complexity);

      // 切换到文档模式
      setDocMode(true);
      setDocId(uploadResult.doc_id);
      setDocFilename(uploadResult.filename);

      // 重置状态
      setGraphData(data);
      setNodeSessions({});
      setSelectedNode(null);
      setChatMessages([]);
      setTeachingPlan(null);
      setCurrentSessionId(newSessionId);
      setCurrentTopic(`doc_${uploadResult.doc_id}`);
      setCurrentGoal('');
      setCurrentGraphLevel('');

      const newSession: FullGraphSession = {
        id: newSessionId,
        topic: `📄 ${uploadResult.filename}`,
        internalTopic: `doc_${uploadResult.doc_id}`,
        date: new Date().toISOString(),
        graphData: data,
        nodeSessions: {},
        learningGoal: '',
        currentLevel: '',
        learnerState,
        averageMastery: calculateAverageMastery(data.nodes),
      };
      setGraphSessions(prev => [newSession, ...prev]);
      setShowLanding(false);
      toast.success('文档知识星图生成成功！');
    } catch (error) {
      toast.error(t('doc.upload_fail'));
      console.error(error);
    } finally {
      setIsDocUploading(false);
      setIsGenerating(false);
      // NOTE: 清空对话框输入
      setInputLevel('');
      setInputGoal('');
    }
  };

  /**
   * 项目模式：根据项目描述生成技能学习路径星图
   */
  const handleGenerateProjectGraph = async () => {
    if (!inputProjectDesc.trim()) return;

    if (graphData) saveCurrentSession();

    setIsGenerating(true);
    setIsDialogOpen(false);
    const newSessionId = Date.now().toString();

    try {
      toast.info(t('project.generating'));
      const data = await api.generateProjectGraph(
        inputProjectDesc,
        inputLevel || '零基础',
        inputComplexity
      );

      // 切换到项目模式
      setProjectMode(true);
      setProjectDescription(inputProjectDesc);
      setDocMode(false);
      setDocId('');
      setDocFilename('');

      // 重置状态
      setGraphData(data);
      setNodeSessions({});
      setSelectedNode(null);
      setChatMessages([]);
      setTeachingPlan(null);
      setCurrentSessionId(newSessionId);
      // NOTE: 项目模式的 topic 使用项目描述前 50 字符作为内部 ID
      const safeTopic = inputProjectDesc.slice(0, 50);
      setCurrentTopic(safeTopic);
      setCurrentGoal('');
      setCurrentGraphLevel(inputLevel);

      // NOTE: 使用 AI 生成的 graph.topic 作为项目简短标题，而非截断用户输入
      const projectTitle = (data as any).graph?.topic || inputProjectDesc.slice(0, 20);

      const newSession: FullGraphSession = {
        id: newSessionId,
        topic: `🚀 ${projectTitle}`,
        internalTopic: safeTopic,
        date: new Date().toISOString(),
        graphData: data,
        nodeSessions: {},
        learningGoal: '',
        currentLevel: inputLevel,
        learnerState,
        averageMastery: calculateAverageMastery(data.nodes),
        projectMode: true,
        projectDescription: inputProjectDesc,
      };
      setGraphSessions(prev => [newSession, ...prev]);
      setShowLanding(false);
      toast.success('项目技能路径星图生成成功！');
    } catch (error) {
      toast.error('Failed to generate project graph');
      console.error(error);
    } finally {
      setIsGenerating(false);
      setInputProjectDesc('');
      setInputLevel('');
    }
  };

  /**
   * 处理用户手动添加节点请求
   * NOTE: 调用后端 AI 扩展 API，生成中间过渡节点并融入现有图谱
   */
  const handleAddNode = async (name: string, currentMastery: number, targetMastery: number, note: string) => {
    if (!graphData || !currentTopic) return;

    setIsAddingNode(true);
    try {
      toast.info(t('add_node.adding'));
      const mergedGraph = await api.expandGraph(
        currentTopic,
        name,
        currentMastery,
        targetMastery,
        note,
        graphData
      );

      // 更新前端图谱状态
      setGraphData(mergedGraph);

      // 同步更新历史会话列表
      setGraphSessions(prev =>
        prev.map(s => {
          if (s.id !== currentSessionId) return s;
          return {
            ...s,
            graphData: mergedGraph,
            averageMastery: calculateAverageMastery(mergedGraph.nodes),
          };
        })
      );

      // 刷新学习状态数据
      await loadState();

      setIsAddNodeDialogOpen(false);
      toast.success(t('add_node.success'));
    } catch (error) {
      console.error('Failed to expand graph:', error);
      toast.error(t('add_node.fail'));
    } finally {
      setIsAddingNode(false);
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

      // NOTE: 判断是否为文档模式会话，正确恢复各模式状态
      const isDocSession = session.topic.startsWith('📄 ');
      if (isDocSession) {
          setDocMode(true);
          const storedTopic = session.internalTopic || '';
          const docIdMatch = storedTopic.match(/doc_([a-f0-9]+)/);
          setDocId(docIdMatch ? docIdMatch[1] : '');
          setDocFilename(session.topic.replace('📄 ', ''));
          setProjectMode(false);
          setProjectDescription('');
      } else if (session.projectMode) {
          // NOTE: 恢复项目模式状态
          setProjectMode(true);
          setProjectDescription(session.projectDescription || '');
          setDocMode(false);
          setDocId('');
          setDocFilename('');
      } else {
          setDocMode(false);
          setDocId('');
          setDocFilename('');
          setProjectMode(false);
          setProjectDescription('');
      }

      // Restore session
      setCurrentSessionId(session.id);
      setCurrentTopic(session.internalTopic || session.topic);
      setCurrentGoal(session.learningGoal);
      setCurrentGraphLevel(session.currentLevel);
      setGraphData(session.graphData);
      setNodeSessions(session.nodeSessions);
      setLearnerState(session.learnerState);
      
      // Reset View State
      setSelectedNode(null);
      setChatMessages([]);
      setTeachingPlan(null);
      setIsPlanView(false);
      setLessonStarted(false);
      setInteractionState('chat');
      setShowLanding(false);
  };

  const handleDeleteSession = async (sessionId: string) => {
      console.log('Deleting session:', sessionId, 'Current:', currentSessionId);

      // NOTE: 获取要删除的 session 的 topic，用于删除后端对应的 JSON 文件
      const sessionToDelete = graphSessions.find(s => s.id === sessionId);
      if (sessionToDelete?.topic) {
          try {
              await api.deleteGraph(sessionToDelete.topic);
          } catch (error) {
              console.error('Failed to delete graph files:', error);
          }
      }

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
          setLessonStarted(false);
          setInteractionState('chat');
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
                showPlanPanel,
                lessonStarted
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
        setShowPlanPanel(savedSession.showPlanPanel);
        setLessonStarted(savedSession.lessonStarted);
    } else {
        // New session
        setChatMessages([]);
        setTeachingPlan(null); // Reset plan
        setIsPlanView(false);
        setLessonStarted(false); // fresh node, lesson not started
        setInteractionState('chat');
    }
  };

  // notes provided by user (either from attributes or manual input) will be sent along with the plan request
  const handleStartLearning = async (userNote: string = '') => {
    if (!selectedNode) return;
    if (lessonStarted) return; // once lesson starts we no longer regenerate
    
    setIsChatLoading(true);
    // NOTE: 生成教学计划时重置交互状态，避免与上课后的按钮冲突
    setInteractionState('chat');
    try {
      toast.info(`Generating Teaching Plan for ${selectedNode.name}...`);
      const attributes = (selectedNode as any).attributes || {};
      
      // NOTE: 文档模式使用 docStartLearning，主题模式使用 startLearning
      const response = docMode
        ? await api.docStartLearning(
            docId,
            selectedNode.name,
            attributes.description || '',
            userNote || attributes.user_note || '',
            attributes.weight_A || 0,
            attributes.weight_B || 0.8
          )
        : await api.startLearning(
            currentTopic,
            selectedNode.name, 
            attributes.description || '', 
            userNote || attributes.user_note || '',
            attributes.weight_A || 0,
            attributes.weight_B || 0.8,
            projectMode ? projectDescription : '',
          );
      
      // Store the plan
      setTeachingPlan(response.content);
      setShowPlanPanel(true); // Auto-open plan panel
      
      // Append the plan without deleting user's message
      setChatMessages(prev => {
        // If there's no message yet (first time), just set the plan
        if (prev.length === 0) {
          return [{ role: 'assistant', content: response.content }];
        }
        // Otherwise append the new plan
        return [...prev, { role: 'assistant', content: response.content }];
      });
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
        // NOTE: 文档模式使用 docStartLesson
        const lessonResponse = docMode
          ? await api.docStartLesson(docId, selectedNode.name)
          : await api.startLesson(currentTopic, selectedNode.name);
        const step = lessonResponse.current_step ?? 0;
        const total = lessonResponse.total_steps ?? 0;
        const stepLabel = total > 0 ? `\uD83D\uDCD6 **Step ${step + 1}/${total}**\n\n` : '';
        setChatMessages([{
            role: 'assistant',
            content: stepLabel + lessonResponse.content,
            sources: lessonResponse.sources || [],
        }]);
        if (total > 0) {
            setStepProgress({ current: step, total });
        }
        setInteractionState('step_taught');
        setIsPlanView(false);
        setLessonStarted(true);
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
          // NOTE: 文档模式使用 docGenerateQuestion
          const questionResponse = docMode
            ? await api.docGenerateQuestion(docId, selectedNode.name)
            : await api.generateQuestion(currentTopic, selectedNode.name);
          setCurrentQuestion(questionResponse.question);

          // NOTE: 确保选择题选项在 Markdown 中正确换行
          // 支持 A) 和 A. 两种选项格式
          const formattedQuestion = questionResponse.question
              .replace(/\s+([A-D][.)]) /g, '\n\n$1 ');

          setChatMessages(prev => [
              ...prev,
              { role: 'assistant', content: `**Quiz Time!** 🧠\n\n${formattedQuestion}` }
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
      handleSendMessage(message);
  };

  const handleReteachStep = async () => {
      if (!selectedNode) return;
      setIsChatLoading(true);
      try {
          // NOTE: 文档模式使用 docReteach
          const result = docMode
            ? await api.docReteach(docId, selectedNode.name)
            : await api.reteach(currentTopic, selectedNode.name, '',
                projectMode ? projectDescription : '');
          setChatMessages(prev => [...prev, {
              role: 'assistant',
              content: '\uD83D\uDD04 **Reteaching this step**\n\n' + result.content,
              sources: result.sources || [],
          }]);
          setInteractionState('step_taught');
      } catch (error) {
          toast.error('Reteach failed');
          console.error(error);
      } finally {
          setIsChatLoading(false);
      }
  };

  const handleReteachFromErrors = async () => {
      if (!selectedNode) return;
      setIsChatLoading(true);
      try {
          // NOTE: 文档模式使用 docReteach
          const result = docMode
            ? await api.docReteach(docId, selectedNode.name, lastEvalAnalysis)
            : await api.reteach(currentTopic, selectedNode.name, lastEvalAnalysis,
                projectMode ? projectDescription : '');
          setChatMessages(prev => [...prev, {
              role: 'assistant',
              content: '\uD83D\uDD04 **Reteaching based on errors**\n\n' + result.content,
              sources: result.sources || [],
          }]);
          setInteractionState('step_taught');
      } catch (error) {
          toast.error('Reteach failed');
          console.error(error);
      } finally {
          setIsChatLoading(false);
      }
  };

  const handleNextStep = async () => {
      if (!selectedNode) return;
      setIsChatLoading(true);
      try {
          // NOTE: 文档模式使用 docNextStep
          const result = docMode
            ? await api.docNextStep(docId, selectedNode.name)
            : await api.nextStep(currentTopic, selectedNode.name);
          if (result.is_plan_completed) {
              setChatMessages(prev => [...prev, { role: 'assistant', content: result.content }]);
              setStepProgress(null);
              setInteractionState('chat');
              toast.success('All steps completed!');
          } else {
              const step = result.current_step ?? 0;
              const total = result.total_steps ?? 0;
              const stepLabel = total > 0 ? `\uD83D\uDCD6 **Step ${step + 1}/${total}**\n\n` : '';
              setChatMessages(prev => [...prev, {
                  role: 'assistant',
                  content: stepLabel + result.content,
                  sources: result.sources || [],
              }]);
              setStepProgress({ current: step, total });
              setInteractionState('step_taught');
          }
      } catch (error) {
          toast.error('Failed to advance to next step');
          console.error(error);
      } finally {
          setIsChatLoading(false);
      }
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

      // Update session history with new mastery
      setGraphSessions(prev => {
          const currentSession = prev.find(s => s.id === currentSessionId);
          if (!currentSession || !currentSession.graphData) return prev; // Should be consistent with graphData state

          // We need to update the specific node in the session's graphData to calculate correct average
          const updatedNodes = currentSession.graphData.nodes.map(node => {
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
          });
          
          const newAverage = calculateAverageMastery(updatedNodes);
          
          return prev.map(s => {
              if (s.id === currentSessionId) {
                  return {
                      ...s,
                      graphData: {
                          ...s.graphData,
                          nodes: updatedNodes
                      },
                      averageMastery: newAverage
                  };
              }
              return s;
          });
      });
  };

  const handleSendMessage = async (message: string, image?: string) => {
    if (!selectedNode) return;

    // Add user message immediately to show they provided input
    const userMessage: ChatMessage = { role: 'user', content: message };
    if (image) {
        userMessage.image = image;
    }
    const newMessages = [...chatMessages, userMessage];
    setChatMessages(newMessages);

    // if a teaching plan exists but lesson hasn't started yet, treat any user input
    // as a request to regenerate the plan instead of normal chat
    if (!lessonStarted && teachingPlan) {
        // chatMessages initially contains only the assistant plan message after generation
        const onlyPlanMessage =
            chatMessages.length === 1 && chatMessages[0].role === 'assistant';
        if (onlyPlanMessage) {
            // regenerate the teaching plan using the user's input as note
            await handleStartLearning(message);
            return;
        }
    }

    setIsChatLoading(true);

    try {
      if (interactionState === 'quiz') {
          // Quiz Mode: Evaluate Answer
          // NOTE: 文档模式使用 docEvaluateAnswer
          const evaluation = docMode
            ? await api.docEvaluateAnswer(docId, selectedNode.name, currentQuestion, message)
            : await api.evaluateAnswer(currentTopic, selectedNode.name, currentQuestion, message);
          
           const feedbackContent = `
**测验结果** 📝

*   **得分：** ${Math.round(evaluation.score * 100)}%
*   **状态：** ${evaluation.is_mastered ? "✅ 已掌握" : "📚 继续学习"}

${evaluation.feedback}
           `;

          setChatMessages(prev => [
              ...prev,
              { role: 'assistant', content: feedbackContent }
          ]);
          
          setLastEvalAnalysis(evaluation.analysis);
          setInteractionState(stepProgress ? 'step_evaluated' : 'chat');
          
          // Refresh graph and state with NEW MASTERY
          updateGraphNodeMastery(selectedNode.name, evaluation.new_mastery);
          loadState();
          
      } else {
          // Normal Chat Mode
          const history = chatMessages.map(msg => ({
            role: msg.role,
            content: msg.content
          }));

          // NOTE: 文档模式使用 docChat
          const response = docMode
            ? await api.docChat(docId, selectedNode.name, message, history, image)
            : await api.chat(currentTopic, selectedNode.name, message, history, image,
                projectMode ? projectDescription : '');
          setChatMessages(prev => [...prev, {
            role: 'assistant',
            content: response.response,
            sources: response.sources || [],
          }]);
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
          onUpdate={(updatedData) => handleUpdateNode(updatedData)}
          onDelete={handleDeleteNode}
       />

       {showLanding ? (
           <HomePage onStart={() => setShowLanding(false)} onUploadDoc={() => setIsDialogOpen(true)} />
       ) : (
           <div className="flex flex-col h-full bg-background/50"> {/* Soft background wrapper */}
              <header className="px-6 py-4 flex items-center justify-between bg-transparent z-10 relative">
                  <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => setShowHistory(!showHistory)} className="mr-1 hover:bg-white/50">
                        <Menu className="h-6 w-6 text-foreground/80" />
                    </Button>
                    
                    <div className="flex items-center gap-4">
                        <div 
                            className="p-1 bg-transparent rounded-xl cursor-pointer hover:bg-white/50 transition-colors" 
                            onClick={() => setShowLanding(true)} 
                            title="Back to Home"
                        >
                            <img src="/logo.png" alt="AstraMentor Logo" className="w-10 h-10 object-contain mx-1 my-1" />
                        </div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent tracking-tight">
                          AstraMentor
                        </h1>
                    </div>
                    
                    {/* Panel Toggles */}
                    <div className="flex items-center gap-2 ml-4">
                        <Button 
                            variant="ghost"
                            size="icon"
                            onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
                            className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-white/50 rounded-xl"
                            title={language === 'zh' ? "Switch to English" : "切换到中文"}
                        >
                            <span className="text-sm font-bold font-mono">{language === 'zh' ? 'En' : 'Zh'}</span>
                        </Button>

                        <Button 
                            variant="ghost"
                            size="icon"
                            onClick={() => setTheme(theme === 'light' ? 'eye-care' : 'light')}
                            className={theme === 'eye-care' ? "h-9 w-9 bg-amber-100/50 text-amber-900 hover:bg-amber-200/50 rounded-xl" : "h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-white/50 rounded-xl"}
                            title={theme === 'light' ? "开启护眼模式" : "切换回白天模式"}
                        >
                            {theme === 'light' ? <BookOpen className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                        </Button>

                        {teachingPlan && !isPlanView && (
                            <Button 
                                variant={showPlanPanel ? "secondary" : "ghost"} 
                                size="sm"
                                onClick={() => setShowPlanPanel(!showPlanPanel)}
                                className={showPlanPanel ? "bg-white shadow-sm text-blue-700 rounded-xl" : "text-muted-foreground hover:bg-white/50 rounded-xl"}
                            >
                                <Book className="mr-2 h-4 w-4" />
                                {showPlanPanel ? t('app.hide_plan') : t('app.view_plan')}
                            </Button>
                        )}
                        
                        <Button 
                            variant={showIDE ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => {
                                if (!showIDE) {
                                    setPreviousGraphState(showGraphPanel);
                                    setShowIDE(true);
                                    setShowGraphPanel(false);
                                } else {
                                    setShowIDE(false);
                                    setShowGraphPanel(previousGraphState);
                                }
                            }}
                            className={showIDE ? "bg-white shadow-sm text-green-700 rounded-xl" : "text-muted-foreground hover:bg-white/50 rounded-xl"}
                            title="Open Code Editor"
                        >
                            <Code className="mr-2 h-4 w-4" />
                            IDE
                        </Button>

                        <Button 
                            variant={showGraphPanel ? "secondary" : "ghost"}
                            size="sm" 
                            onClick={() => {
                                setShowGraphPanel(!showGraphPanel);
                                if (!showGraphPanel) setShowIDE(false); 
                            }}
                            className={showGraphPanel ? "bg-white shadow-sm text-slate-700 rounded-xl" : "text-muted-foreground hover:bg-white/50 rounded-xl"}
                        >
                            <Search className="mr-2 h-4 w-4" />
                            {showGraphPanel ? t('app.hide_graph') : t('app.view_graph')}
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* 文档模式标识 */}
                  {docMode && (
                    <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
                      📄 {docFilename}
                    </span>
                  )}
                  {/* 项目模式标识 */}
                  {projectMode && (
                    <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium truncate max-w-[200px]" title={projectDescription}>
                      🚀 {t('project.mode_label')}
                    </span>
                  )}
                  {graphData && (
                    <Button
                      onClick={() => setIsAddNodeDialogOpen(true)}
                      variant="outline"
                      className="shadow-md hover:shadow-lg transition-all duration-300 rounded-xl px-5 border-emerald-300 text-black hover:bg-emerald-50 hover:border-emerald-400"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {t('add_node.btn')}
                    </Button>
                  )}
                  <Button onClick={() => setIsDialogOpen(true)} className="bg-primary/80 hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl px-6">
                      <Sparkles className="mr-2 h-4 w-4" />
                      {t('app.generate_btn')}
                  </Button>
                </div>
              </header>

              <main className="flex-1 flex overflow-hidden p-6 gap-6 pt-0">
                {/* History Sidebar */}
                <div className={`transition-all duration-300 ${showHistory ? 'w-64 opacity-100' : 'w-0 opacity-0 overflow-hidden'}`}>
                    <div className="h-full bg-white/80 backdrop-blur-xl rounded-md dark:rounded-3xl shadow-sm border-[1.5px] border-black dark:border dark:border-white/20 overflow-hidden">
                        <HistorySidebar 
                            isOpen={true} // Always render internal logic if container is visible
                            sessions={graphSessions} 
                            currentSessionId={currentSessionId}
                            onSelectSession={handleLoadSession}
                            onDeleteSession={handleDeleteSession}
                            onClose={() => setShowHistory(false)}
                        />
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden bg-white/60 backdrop-blur-xl rounded-md dark:rounded-3xl shadow-sm border-[1.5px] border-black dark:border dark:border-white/20">
                    <ResizablePanelGroup orientation="horizontal" className="h-full w-full rounded-md dark:rounded-3xl">
                        
                        {!isPlanView && teachingPlan && showPlanPanel && (
                            <>
                                <ResizablePanel defaultSize="25" minSize="10" maxSize="80" className="flex flex-col bg-transparent">
                                    <div className="h-full p-4 flex flex-col gap-4 animate-in slide-in-from-left-5 duration-300">
                                        <Card className="h-full flex flex-col border-none shadow-none bg-transparent">
                                            <CardHeader className="py-3 px-4 bg-transparent">
                                                <CardTitle className="text-sm font-medium flex items-center gap-2 text-primary">
                                                    <Book className="w-4 h-4" />
                                                    {t('app.current_plan')}
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-0 flex-1 overflow-hidden">
                                                <ScrollArea className="h-full pr-4">
                                                    <div className="text-sm text-foreground leading-relaxed ai-content">
                                                        <ReactMarkdown 
                                                            remarkPlugins={[remarkGfm, remarkMath]}
                                                            rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
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
                                                                            customStyle={{ borderRadius: '1rem' }}
                                                                        >
                                                                            {String(children).replace(/\n$/, '')}
                                                                        </SyntaxHighlighter>
                                                                    ) : (
                                                                        <code className="bg-muted px-1 rounded-md font-mono text-xs" {...props}>
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
                                <ResizableHandle withHandle className="bg-transparent opacity-50 hover:opacity-100" />
                            </>
                        )}

                        <ResizablePanel defaultSize={teachingPlan && !isPlanView ? "35" : "40"} minSize="10" className="flex flex-col bg-transparent">
                            <div className="h-full p-0 flex flex-col gap-4 overflow-hidden">
                                <div className="flex-1 min-h-0 overflow-hidden">
                                    {selectedNode && chatMessages.length === 0 && !teachingPlan ? (
                                        <div className="flex flex-col items-center justify-center h-full text-center space-y-4 p-6 bg-transparent rounded-lg">
                                            <h3 className="text-lg font-semibold">{t('app.confirm_learning', { topic: selectedNode.name })}</h3>
                                            <p className="text-sm text-muted-foreground">
                                            {t('app.start_learning_desc')}
                                            </p>
                                            <Button onClick={() => handleStartLearning()} disabled={isChatLoading} className="rounded-xl shadow-md">
                                            {isChatLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            {t('app.start_learning_btn')}
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col h-full min-h-0">
                                            <div className="flex-1 min-h-0">
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
                                                    onReteachStep={handleReteachStep}
                                                    onNextStep={handleNextStep}
                                                    onReteachFromErrors={handleReteachFromErrors}
                                                    stepProgress={stepProgress}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </ResizablePanel>
                        
                        
                        {(showGraphPanel || showIDE) && (
                            <>
                                <ResizableHandle withHandle className="bg-black dark:bg-transparent opacity-80 dark:opacity-50 hover:opacity-100 w-[1.5px] relative z-10" />
                                <ResizablePanel defaultSize={teachingPlan && !isPlanView ? "40" : "60"} minSize="10">
                                    {showIDE ? (
                                        <IDEPanel />
                                    ) : (
                                        <div className="h-full relative bg-transparent">
                                            <KnowledgeGraph 
                                                data={graphData} 
                                                onNodeClick={handleNodeClick} 
                                                onNodeContextMenu={handleNodeContextMenu}
                                                theme={theme}
                                                onViewModeChange={setGraphViewMode}
                                                initialViewMode={graphViewMode}
                                            />
                                            <div className="absolute top-4 left-4 z-10 w-auto">
                                                <Dashboard state={learnerState} graphData={graphData} viewMode={graphViewMode} />
                                            </div>
                                            {!graphData && !isGenerating && (
                                                <div className="absolute inset-0 flex flex-col bg-slate-50/50">
                                                    {/* Spacer to align with ChatInterface header */}
                                                    <div className="py-3 px-6 invisible">
                                                         <div className="flex items-center gap-2 text-base font-medium">
                                                            <div className="w-5 h-5" />
                                                            Spacer
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground">
                                                        <div className="mb-4">
                                                            <Sparkles className="w-12 h-12 text-slate-800" strokeWidth={1.5} />
                                                        </div>
                                                        <h3 className="text-lg font-semibold text-slate-700 mb-2">
                                                            {t('app.dialog_title')}
                                                        </h3>
                                                        <p className="max-w-xs text-sm">
                                                            {t('graph.enter_topic')}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                            {isGenerating && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-50">
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
           </div>
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
           complexity={inputComplexity}
           setComplexity={setInputComplexity}
           isGenerating={isGenerating}
            onGenerate={handleGenerateGraph}
            onUploadAndGenerate={handleUploadAndGenerate}
            isDocUploading={isDocUploading}
            inputProjectDesc={inputProjectDesc}
            setInputProjectDesc={setInputProjectDesc}
            onGenerateProject={handleGenerateProjectGraph}
            t={t}
       />
       <AddNodeDialog
         open={isAddNodeDialogOpen}
         onOpenChange={setIsAddNodeDialogOpen}
         isAdding={isAddingNode}
         onAdd={handleAddNode}
         t={t}
       />
       <Toaster />
    </div>
  );
}

export default App;
