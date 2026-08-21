import { lazy, Suspense, useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { api } from './api/client';
import { streamLearning } from './api/stream';
import { getCourseIndexNotReadyDetail, readableApiError } from './api/errors';
import { buildCourseCurrentLevel } from './features/courses/courseUtils';
import { resolveQuizContextRecovery } from './features/chat/quizRecovery';
import type { GraphData, GraphNode, GraphNodeAttributes, LearnerState, ChatMessage, Course, ChatOptions, SessionSnapshot, CourseCitation, GroundingSource, KnowledgeScope, CourseIndexRecovery } from './types';
import { NodeDetailsModal } from './features/graph/NodeDetailsModal';
import { AddNodeDialog } from './features/graph/AddNodeDialog';
import Dashboard from './features/dashboard/Dashboard';
import HomePage from './features/home/HomePage';
import { Button } from './components/ui/button';
import { Search, Loader2, Book, Menu, Sun, BookOpen, Code, Sparkles, Plus } from 'lucide-react';
import { GenerateGraphDialog } from './features/graph/GenerateGraphDialog';
import { ScrollArea } from './components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable"
import { HistorySidebar, type GraphSession } from './features/sidebar/HistorySidebar';
import { useLanguage } from './contexts/LanguageContext';

// The graph renderer and Monaco editor are the two heaviest optional surfaces.
// Loading them only after entering a learning session keeps the course catalog fast.
const KnowledgeGraph = lazy(() => import('./features/graph/KnowledgeGraph'));
const IDEPanel = lazy(() =>
  import('./features/ide/IDEPanel').then((module) => ({ default: module.IDEPanel })),
);
const ChatInterface = lazy(() => import('./features/chat/ChatInterface'));
const MarkdownContent = lazy(() =>
  import('./components/MarkdownContent').then((module) => ({ default: module.MarkdownContent })),
);

// Define session state type
interface NodeSessionState {
  chatMessages: ChatMessage[];
  teachingPlan: string | null;
  isPlanView: boolean;
  showPlanPanel: boolean; 
  lessonStarted: boolean;
  interactionState?: 'chat' | 'confirm_understanding' | 'quiz' | 'step_taught' | 'step_evaluated';
  currentQuestion?: string;
  currentQuestionId?: string;
  stepProgress?: { current: number; total: number } | null;
  lastEvalAnalysis?: string;
}

interface ContextMenuNode {
  id: string;
  data?: GraphNodeAttributes & {
    label?: string;
    name?: string;
    attributes?: GraphNodeAttributes;
  };
}

interface NodeUpdatePayload {
  weight_A: number;
  weight_B: number;
  user_note: string;
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
    courseId?: string;
    courseTitle?: string;
    docId?: string;
    docFilename?: string;
    selectedNode?: { id: string; name: string; attributes?: GraphNodeAttributes } | null;
    savedStepProgress?: { current: number; total: number } | null;
    mode?: string;
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
  const [selectedNode, setSelectedNode] = useState<{ id: string; name: string; attributes?: GraphNodeAttributes } | null>(null);
  
  // Session State Storage (Map of Node ID -> Session State)
  const [nodeSessions, setNodeSessions] = useState<Record<string, NodeSessionState>>({});

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [contextMenuNode, setContextMenuNode] = useState<ContextMenuNode | null>(null);
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

  // ======== 课程知识库模式状态 ========
  const [activeCourseId, setActiveCourseId] = useState('');
  const [activeCourseTitle, setActiveCourseTitle] = useState('');
  const [courseRecovery, setCourseRecovery] = useState<CourseIndexRecovery | null>(null);

 
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
  const [theme, setTheme] = useState<'dark' | 'eye-care'>('dark');
  const [interactionState, setInteractionState] = useState<'chat' | 'confirm_understanding' | 'quiz' | 'step_taught' | 'step_evaluated'>('chat');
  const [currentQuestion, setCurrentQuestion] = useState<string>("");
  const [currentQuestionId, setCurrentQuestionId] = useState<string>("");
  const [chatOptions, setChatOptions] = useState<ChatOptions>(() => {
      try {
          const stored = window.localStorage.getItem('astramentor.chat-options');
          if (stored) return { maxTokens: 4096, thinking: false, ...JSON.parse(stored) };
      } catch { /* use safe defaults */ }
      return { maxTokens: 4096, thinking: false };
  });
  // NOTE: step progress tracking and last evaluation analysis
  const [stepProgress, setStepProgress] = useState<{ current: number; total: number } | null>(null);
  const [lastEvalAnalysis, setLastEvalAnalysis] = useState<string>('');

  // Apply theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('eye-care', 'dark');
    if (!showLanding && theme === 'eye-care') {
      root.classList.add('eye-care');
    } else {
      root.classList.add('dark');
    }
  }, [theme, showLanding]);

  useEffect(() => {
      window.localStorage.setItem('astramentor.chat-options', JSON.stringify(chatOptions));
  }, [chatOptions]);

  // History Sessions
  const [graphSessions, setGraphSessions] = useState<FullGraphSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => Date.now().toString()); // Start with a default ID

  // Load initial state
  useEffect(() => {
    loadState();
    void api.listSessions().then((sessions) => {
      setGraphSessions(sessions.map((session) => ({
        id: session.session_id,
        topic: session.title,
        date: session.updated_at || session.created_at || new Date().toISOString(),
        averageMastery: session.average_mastery,
        graphData: { nodes: [], links: [] },
        nodeSessions: {},
        learningGoal: '',
        currentLevel: '',
        learnerState: null,
        internalTopic: '',
        courseId: session.course_id,
        courseTitle: session.course_title,
      })));
    }).catch((error) => console.error('Failed to load session history:', error));
  }, []);

  const loadState = async () => {
    try {
      const state = await api.getLearnerState();
      setLearnerState(state);
    } catch (error) {
      console.error('Failed to load state:', error);
    }
  };

  const streamAssistant = async (
      endpoint: string,
      body: Record<string, unknown>,
      options: { prefix?: string; replaceMessages?: boolean } = {},
  ) => {
      const messageId = `stream-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let content = options.prefix || '';
      let reasoning = '';
      let citations: CourseCitation[] = [];
      let sources: GroundingSource[] = [];
      let knowledgeScope: KnowledgeScope = 'extension';
      let currentStep: number | undefined;
      let totalSteps: number | undefined;
      let isPlanCompleted = false;
      let hasIncrementalOutput = false;
      const placeholder: ChatMessage = {
          id: messageId,
          role: 'assistant',
          content,
          reasoning,
          isStreaming: true,
      };
      setChatMessages((previous) => options.replaceMessages ? [placeholder] : [...previous, placeholder]);

      const update = () => setChatMessages((previous) => previous.map((item) =>
          item.id === messageId
              ? { ...item, content, reasoning, citations, sources, knowledgeScope, isStreaming: true }
              : item
      ));

      try {
          await streamLearning(endpoint, body, ({ event, data }) => {
               if (event === 'content_delta') {
                   const delta = String(data.text || '');
                   content += delta;
                   hasIncrementalOutput ||= Boolean(delta);
               }
               if (event === 'reasoning_delta') {
                   const delta = String(data.text || '');
                   reasoning += delta;
                   hasIncrementalOutput ||= Boolean(delta);
               }
              if (event === 'warning') toast.warning(String(data.message || '当前模型已降级为普通回答'));
              if (event === 'citations') citations = (data.items || []) as CourseCitation[];
              if (event === 'sources') sources = (data.items || []) as GroundingSource[];
              if (event === 'meta') {
                  knowledgeScope = (data.knowledge_scope || 'extension') as KnowledgeScope;
                  currentStep = typeof data.current_step === 'number' ? data.current_step : undefined;
                  totalSteps = typeof data.total_steps === 'number' ? data.total_steps : undefined;
                  isPlanCompleted = Boolean(data.is_plan_completed);
              }
              if (event !== 'done') update();
          });
       } catch (error) {
           const courseIndexError = getCourseIndexNotReadyDetail(error);
           setChatMessages((previous) => courseIndexError && !hasIncrementalOutput
               ? previous.filter((item) => item.id !== messageId)
               : previous.map((item) => item.id === messageId ? { ...item, isStreaming: false } : item)
           );
           throw error;
       }
      setChatMessages((previous) => previous.map((item) =>
          item.id === messageId
              ? { ...item, content, reasoning, citations, sources, knowledgeScope, isStreaming: false }
              : item
      ));
      return { content, reasoning, citations, sources, knowledgeScope, currentStep, totalSteps, isPlanCompleted };
  };

  const handleNodeContextMenu = (_event: React.MouseEvent, node: ContextMenuNode) => {
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
        await api.saveGraph(currentTopic, updatedGraphData, activeCourseId || undefined);
      } catch (error) {
        console.error('Failed to save graph to disk:', error);
      }
    }

    toast.success(t('node_modal.delete_success'));
  };

  const calculateAverageMastery = (nodes: GraphNode[]): number => {
      if (!nodes || nodes.length === 0) return 0;
      const totalMastery = nodes.reduce((sum, node) => sum + (node.attributes?.weight_A || 0), 0);
      return totalMastery / nodes.length;
  };

  /**
   * 更新星图节点数据
   * NOTE: 同步更新前端状态，并调用后端 API 将变更持久化到磁盘 JSON 文件
   */
  const handleUpdateNode = async (updatedData: NodeUpdatePayload) => {
    if (!graphData || !contextMenuNode) return;
    
    // 更新本地 graphData 状态
    const updatedNodes = graphData.nodes.map(n => {
       if (n.id === contextMenuNode.id) {
           return {
               ...n,
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
            await api.saveGraph(currentTopic, updatedGraphData, activeCourseId || undefined);
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
      const mergedNodeSessions = { ...nodeSessions };
      if (selectedNode) {
          mergedNodeSessions[selectedNode.id] = {
              chatMessages,
              teachingPlan,
              isPlanView,
              showPlanPanel,
              lessonStarted,
              interactionState,
              currentQuestion,
              currentQuestionId,
              stepProgress,
              lastEvalAnalysis,
          };
      }
      
      // NOTE: 文档模式下 currentTopic 是内部 ID（doc_xxx），侧边栏应显示文件名
      const existingSession = graphSessions.find(s => s.id === currentSessionId);
      const displayTopic = existingSession?.topic
        || (activeCourseId && activeCourseTitle ? `📚 ${activeCourseTitle}` : '')
        || (docMode && docFilename ? `📄 ${docFilename}` : '')
        || (projectMode && projectDescription
           ? `🚀 ${graphData.graph?.topic || projectDescription.slice(0, 20)}`
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
          courseId: activeCourseId || undefined,
          courseTitle: activeCourseTitle || undefined,
          docId: docId || undefined,
          docFilename: docFilename || undefined,
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

      const snapshot: SessionSnapshot = {
          schema_version: 1,
          session_id: currentSessionId,
          mode: docMode ? 'document' : projectMode ? 'project' : activeCourseId ? 'course' : 'topic',
          title: displayTopic,
          internal_topic: currentTopic,
          course_id: activeCourseId || undefined,
          course_title: activeCourseTitle || undefined,
          graph_data: graphData,
          node_sessions: mergedNodeSessions as unknown as Record<string, unknown>,
          selected_node: selectedNode,
          step_progress: stepProgress,
          learning_goal: currentGoal,
          current_level: currentGraphLevel,
          learner_state: learnerState,
          average_mastery: calculateAverageMastery(graphData.nodes),
          doc_id: docId || undefined,
          doc_filename: docFilename || undefined,
          project_description: projectDescription || undefined,
      };
      void api.saveSession(snapshot).catch((error) => {
          console.error('Failed to persist learning session:', error);
      });
  };

  /** Recover quiz context in-place, and route only course-index 409s back to the catalog. */
  const handleRequestError = (error: unknown, fallbackMessage: string): boolean => {
      const quizRecovery = resolveQuizContextRecovery(error);
      if (quizRecovery) {
          setCurrentQuestion(quizRecovery.currentQuestion);
          setCurrentQuestionId(quizRecovery.currentQuestionId);
          setInteractionState(quizRecovery.interactionState);
          toast.warning(quizRecovery.message);
          return true;
      }
      const detail = getCourseIndexNotReadyDetail(error);
      if (!detail) {
          toast.error(readableApiError(error, fallbackMessage));
          return false;
      }
      if (graphData) saveCurrentSession();
      setCourseRecovery({
          courseId: detail.course_id,
          status: detail.status,
          message: detail.message,
      });
      setShowLanding(true);
      toast.warning(detail.message);
      return true;
  };

  // Persist the active lesson after meaningful UI changes. The debounce keeps
  // streaming deltas from causing one disk write per token.
  useEffect(() => {
      if (showLanding || !graphData) return;
      if (chatMessages.some((message) => message.isStreaming)) return;
      const timer = window.setTimeout(() => saveCurrentSession(), 900);
      return () => window.clearTimeout(timer);
      // saveCurrentSession intentionally captures the latest render snapshot.
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLanding, graphData, nodeSessions, selectedNode, chatMessages, teachingPlan,
      isPlanView, lessonStarted, interactionState, stepProgress, currentQuestion,
      currentQuestionId, lastEvalAnalysis, currentSessionId]);

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
      setActiveCourseId('');
      setActiveCourseTitle('');
      
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

  const handleStartCourse = async (course: Course) => {
    if (graphData) saveCurrentSession();

    setIsGenerating(true);
    const newSessionId = Date.now().toString();
    const courseCurrentLevel = buildCourseCurrentLevel(course);
    try {
      toast.info(`正在载入《${course.title}》课程星图…`);
      const data = await api.generateGraph(
        course.title,
        `严格依据《${course.title}》课程教材建立系统学习路径`,
        courseCurrentLevel,
        '完成课程核心知识与实训',
        2,
        course.id,
      );

      setGraphData(data);
      setNodeSessions({});
      setSelectedNode(null);
      setChatMessages([]);
      setTeachingPlan(null);
      setCurrentSessionId(newSessionId);
      setCurrentTopic(course.title);
      setCurrentGoal('完成课程核心知识与实训');
      setCurrentGraphLevel(courseCurrentLevel);
      setActiveCourseId(course.id);
      setActiveCourseTitle(course.title);
      setDocMode(false);
      setDocId('');
      setDocFilename('');
      setProjectMode(false);
      setProjectDescription('');

      const newSession: FullGraphSession = {
        id: newSessionId,
        topic: `📚 ${course.title}`,
        internalTopic: course.title,
        date: new Date().toISOString(),
        graphData: data,
        nodeSessions: {},
        learningGoal: '完成课程核心知识与实训',
        currentLevel: courseCurrentLevel,
        learnerState,
        averageMastery: calculateAverageMastery(data.nodes),
        courseId: course.id,
        courseTitle: course.title,
      };
      setGraphSessions((previous) => [newSession, ...previous]);
      setCourseRecovery(null);
      setShowLanding(false);
      toast.success('课程星图已准备好');
    } catch (error) {
      console.error(error);
      handleRequestError(error, '课程星图生成失败，请检查模型配置');
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * 文档模式：上传 PDF 并生成星图
   * NOTE: 先上传解析，再调用文档星图 Agent 生成
   */
  const handleUploadAndGenerate = async (file: File, complexity: number) => {
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
      setActiveCourseId('');
      setActiveCourseTitle('');
      setProjectMode(false);
      setProjectDescription('');

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
      setActiveCourseId('');
      setActiveCourseTitle('');
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
      const projectTitle = data.graph?.topic || inputProjectDesc.slice(0, 20);

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
        graphData,
        activeCourseId || undefined,
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
      handleRequestError(error, t('add_node.fail'));
    } finally {
      setIsAddingNode(false);
    }
  };

  const handleLoadSession = async (sessionId: string) => {
      if (sessionId === currentSessionId && graphData) {
          setShowLanding(false);
          return;
      }

      // Save current before switching?
      if (graphData) {
          saveCurrentSession();
      }

      let session = graphSessions.find(s => s.id === sessionId);
      if (!session) return;

      try {
          const snapshot = await api.getSession(sessionId);
          session = {
              id: snapshot.session_id,
              topic: snapshot.title,
              date: snapshot.updated_at || snapshot.created_at || new Date().toISOString(),
              graphData: snapshot.graph_data,
              nodeSessions: snapshot.node_sessions as unknown as Record<string, NodeSessionState>,
              learningGoal: snapshot.learning_goal,
              currentLevel: snapshot.current_level,
              learnerState: snapshot.learner_state || null,
              internalTopic: snapshot.internal_topic,
              projectMode: snapshot.mode === 'project',
              projectDescription: snapshot.project_description,
              courseId: snapshot.course_id,
              courseTitle: snapshot.course_title,
              docId: snapshot.doc_id,
              docFilename: snapshot.doc_filename,
              selectedNode: snapshot.selected_node,
              savedStepProgress: snapshot.step_progress,
              averageMastery: snapshot.average_mastery,
              mode: snapshot.mode,
          };
          setGraphSessions((previous) => previous.map((item) => item.id === sessionId ? session! : item));
      } catch (error) {
          if (!session.graphData.nodes.length) {
              toast.error('历史学习记录读取失败');
              console.error(error);
              return;
          }
      }

      // NOTE: 判断是否为文档模式会话，正确恢复各模式状态
      const isDocSession = session.mode === 'document' || session.topic.startsWith('📄 ');
      if (session.courseId) {
          setActiveCourseId(session.courseId);
          setActiveCourseTitle(session.courseTitle || session.topic.replace('📚 ', ''));
          setDocMode(false);
          setDocId('');
          setDocFilename('');
          setProjectMode(false);
          setProjectDescription('');
      } else if (isDocSession) {
          setActiveCourseId('');
          setActiveCourseTitle('');
          setDocMode(true);
          const storedTopic = session.internalTopic || '';
          const docIdMatch = storedTopic.match(/doc_([a-f0-9]+)/);
          setDocId(session.docId || (docIdMatch ? docIdMatch[1] : ''));
          setDocFilename(session.docFilename || session.topic.replace('📄 ', ''));
          setProjectMode(false);
          setProjectDescription('');
      } else if (session.projectMode) {
          setActiveCourseId('');
          setActiveCourseTitle('');
          // NOTE: 恢复项目模式状态
          setProjectMode(true);
          setProjectDescription(session.projectDescription || '');
          setDocMode(false);
          setDocId('');
          setDocFilename('');
      } else {
          setActiveCourseId('');
          setActiveCourseTitle('');
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
      
      const restoredNode = session.selectedNode || null;
      const restoredNodeState = restoredNode ? session.nodeSessions[restoredNode.id] : undefined;
      setSelectedNode(restoredNode);
      setChatMessages(restoredNodeState?.chatMessages || []);
      setTeachingPlan(restoredNodeState?.teachingPlan || null);
      setIsPlanView(restoredNodeState?.isPlanView || false);
      setShowPlanPanel(restoredNodeState?.showPlanPanel ?? true);
      setLessonStarted(restoredNodeState?.lessonStarted || false);
      setInteractionState(restoredNodeState?.interactionState || 'chat');
      setCurrentQuestion(restoredNodeState?.currentQuestion || '');
      setCurrentQuestionId(restoredNodeState?.currentQuestionId || '');
      setStepProgress(restoredNodeState?.stepProgress || session.savedStepProgress || null);
      setLastEvalAnalysis(restoredNodeState?.lastEvalAnalysis || '');
      setShowLanding(false);
  };

  const handleDeleteSession = async (sessionId: string) => {
      console.log('Deleting session:', sessionId, 'Current:', currentSessionId);

      // Deleting a history card removes only its session snapshot. Graph and
      // learner-state files may be shared by another session with the same
      // topic, so they must not be deleted implicitly here.
      try {
          await api.deleteSession(sessionId);
      } catch (error) {
          console.warn('Session snapshot was already absent:', error);
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
          setActiveCourseId('');
          setActiveCourseTitle('');
          setLessonStarted(false);
          setInteractionState('chat');
          // Generate new ID for potential new session
          setCurrentSessionId(Date.now().toString());
          
          toast.success('已清空并删除当前会话');
      } else {
          toast.success('已删除历史记录');
      }
  };



  const handleNodeClick = (nodeId: string, nodeName: string, attributes: GraphNodeAttributes) => {
    // 1. Save current session state if a node is selected
    if (selectedNode) {
        setNodeSessions(prev => ({
            ...prev,
            [selectedNode.id]: {
                chatMessages,
                teachingPlan,
                isPlanView,
                showPlanPanel,
                lessonStarted,
                interactionState,
                currentQuestion,
                currentQuestionId,
                stepProgress,
                lastEvalAnalysis,
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
        setInteractionState(savedSession.interactionState || 'chat');
        setCurrentQuestion(savedSession.currentQuestion || '');
        setCurrentQuestionId(savedSession.currentQuestionId || '');
        setStepProgress(savedSession.stepProgress || null);
        setLastEvalAnalysis(savedSession.lastEvalAnalysis || '');
    } else {
        // New session
        setChatMessages([]);
        setTeachingPlan(null); // Reset plan
        setIsPlanView(false);
        setLessonStarted(false); // fresh node, lesson not started
        setInteractionState('chat');
        setCurrentQuestion('');
        setCurrentQuestionId('');
        setStepProgress(null);
        setLastEvalAnalysis('');
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
      const attributes = selectedNode.attributes || {};
      
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
            activeCourseId || undefined,
          );
      
      // Store the plan
      setTeachingPlan(response.content);
      setShowPlanPanel(true); // Auto-open plan panel
      
      // Append the plan without deleting user's message
      setChatMessages(prev => {
        // If there's no message yet (first time), just set the plan
        if (prev.length === 0) {
          return [{ role: 'assistant', content: response.content, citations: response.citations, knowledgeScope: response.knowledge_scope }];
        }
        // Otherwise append the new plan
        return [...prev, { role: 'assistant', content: response.content, citations: response.citations, knowledgeScope: response.knowledge_scope }];
      });
      setIsPlanView(true); // Enable "Start Lesson" button
    } catch (error) {
      handleRequestError(error, 'Failed to generate teaching plan');
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
        let step = 0;
        let total = 0;
        if (docMode) {
            const streamed = await streamAssistant('/doc/learning/lesson/stream', {
                doc_id: docId, node_name: selectedNode.name,
            }, { replaceMessages: true });
            step = streamed.currentStep ?? 0;
            total = streamed.totalSteps ?? 0;
            if (total > 0) {
                const label = `\uD83D\uDCD6 **Step ${step + 1}/${total}**\n\n`;
                setChatMessages((previous) => previous.map((item) => item.role === 'assistant' ? { ...item, content: label + item.content } : item));
            }
        } else {
            const streamed = await streamAssistant('/learning/lesson/stream', {
                topic: currentTopic,
                course_id: activeCourseId || undefined,
                node_name: selectedNode.name,
                project_description: projectMode ? projectDescription : '',
            }, { replaceMessages: true });
            step = streamed.currentStep ?? 0;
            total = streamed.totalSteps ?? 0;
            if (total > 0) {
                const label = `\uD83D\uDCD6 **Step ${step + 1}/${total}**\n\n`;
                setChatMessages((previous) => previous.map((item) => item.role === 'assistant' ? { ...item, content: label + item.content } : item));
            }
        }
        if (total > 0) {
            setStepProgress({ current: step, total });
        }
        setInteractionState('step_taught');
        setIsPlanView(false);
        setLessonStarted(true);
        // NOTE: 开始上课后默认隐藏教学计划面板，让用户聚焦课程内容
        setShowPlanPanel(false);
    } catch (error) {
        handleRequestError(error, 'Failed to start lesson');
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
            : await api.generateQuestion(currentTopic, selectedNode.name, activeCourseId || undefined);
          setCurrentQuestion(questionResponse.question);
          setCurrentQuestionId(questionResponse.question_id || '');

          // NOTE: 确保选择题选项在 Markdown 中正确换行
          // 支持 A) 和 A. 两种选项格式
          const formattedQuestion = questionResponse.question
              .replace(/\s+([A-D][.)]) /g, '\n\n$1 ');

          setChatMessages(prev => [
              ...prev,
              { role: 'assistant', content: `**Quiz Time!** 🧠\n\n${formattedQuestion}`, citations: questionResponse.citations, knowledgeScope: questionResponse.knowledge_scope }
          ]);
          setInteractionState('quiz');
      } catch (error) {
          handleRequestError(error, 'Failed to generate quiz');
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
          if (docMode) {
              await streamAssistant('/doc/learning/reteach/stream', {
                  doc_id: docId, node_name: selectedNode.name, error_analysis: '',
              }, { prefix: '\uD83D\uDD04 **Reteaching this step**\n\n' });
          } else {
              await streamAssistant('/learning/reteach/stream', {
                  topic: currentTopic, course_id: activeCourseId || undefined,
                  node_name: selectedNode.name, error_analysis: '',
                  project_description: projectMode ? projectDescription : '',
              }, { prefix: '\uD83D\uDD04 **Reteaching this step**\n\n' });
          }
          setInteractionState('step_taught');
      } catch (error) {
          handleRequestError(error, 'Reteach failed');
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
          if (docMode) {
              await streamAssistant('/doc/learning/reteach/stream', {
                  doc_id: docId, node_name: selectedNode.name, error_analysis: lastEvalAnalysis,
              }, { prefix: '\uD83D\uDD04 **Reteaching based on errors**\n\n' });
          } else {
              await streamAssistant('/learning/reteach/stream', {
                  topic: currentTopic, course_id: activeCourseId || undefined,
                  node_name: selectedNode.name, error_analysis: lastEvalAnalysis,
                  project_description: projectMode ? projectDescription : '',
              }, { prefix: '\uD83D\uDD04 **Reteaching based on errors**\n\n' });
          }
          setInteractionState('step_taught');
      } catch (error) {
          handleRequestError(error, 'Reteach failed');
          console.error(error);
      } finally {
          setIsChatLoading(false);
      }
  };

  const handleNextStep = async () => {
      if (!selectedNode) return;
      setIsChatLoading(true);
      try {
          if (docMode) {
              const result = await streamAssistant('/doc/learning/next-step/stream', {
                  doc_id: docId, node_name: selectedNode.name,
              });
              if (result.isPlanCompleted) {
                  setStepProgress(null);
                  setInteractionState('chat');
                  toast.success('All steps completed!');
                  return;
              }
              const step = result.currentStep ?? 0;
              const total = result.totalSteps ?? 0;
              const stepLabel = total > 0 ? `\uD83D\uDCD6 **Step ${step + 1}/${total}**\n\n` : '';
              if (stepLabel) setChatMessages((previous) => previous.map((item, index) =>
                  index === previous.length - 1 && item.role === 'assistant' ? { ...item, content: stepLabel + item.content } : item
              ));
              setStepProgress({ current: step, total });
              setInteractionState('step_taught');
          } else {
              const result = await streamAssistant('/learning/next-step/stream', {
                  topic: currentTopic, course_id: activeCourseId || undefined,
                  node_name: selectedNode.name,
                  project_description: projectMode ? projectDescription : '',
              });
              if (result.isPlanCompleted) {
                  setStepProgress(null);
                  setInteractionState('chat');
                  toast.success('All steps completed!');
                  return;
              }
              const step = result.currentStep ?? 0;
              const total = result.totalSteps ?? 0;
              const stepLabel = total > 0 ? `\uD83D\uDCD6 **Step ${step + 1}/${total}**\n\n` : '';
              if (stepLabel) {
                  setChatMessages((previous) => previous.map((item, index) =>
                      index === previous.length - 1 && item.role === 'assistant'
                          ? { ...item, content: stepLabel + item.content }
                          : item
                  ));
              }
              setStepProgress({ current: step, total });
              setInteractionState('step_taught');
          }
      } catch (error) {
          handleRequestError(error, 'Failed to advance to next step');
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
            ? await api.docEvaluateAnswer(docId, selectedNode.name, currentQuestion, message, currentQuestionId)
            : await api.evaluateAnswer(currentTopic, selectedNode.name, currentQuestion, message, activeCourseId || undefined, currentQuestionId);
          
           const feedbackContent = `
**测验结果** 📝

*   **得分：** ${Math.round(evaluation.score * 100)}%
*   **状态：** ${evaluation.is_mastered ? "✅ 已掌握" : "📚 继续学习"}

${evaluation.feedback}
           `;

          setChatMessages(prev => [
              ...prev,
              { role: 'assistant', content: feedbackContent, citations: evaluation.citations, knowledgeScope: evaluation.knowledge_scope }
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
          if (docMode) {
              await streamAssistant('/doc/learning/chat/stream', {
                  doc_id: docId, node_name: selectedNode.name, question: message,
                  history, image, max_tokens: chatOptions.maxTokens, thinking: chatOptions.thinking,
              });
          } else {
              await streamAssistant('/learning/chat/stream', {
                  topic: currentTopic,
                  course_id: activeCourseId || undefined,
                  node_name: selectedNode.name,
                  question: message,
                  image,
                  history,
                  project_description: projectMode ? projectDescription : '',
                  max_tokens: chatOptions.maxTokens,
                  thinking: chatOptions.thinking,
              });
          }
      }
    } catch (error) {
      handleRequestError(error, 'Failed to send message');
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
           <HomePage
             onStart={() => setIsDialogOpen(true)}
             onUploadDoc={() => setIsDialogOpen(true)}
             onSelectCourse={handleStartCourse}
             sessions={graphSessions}
             onResumeSession={(sessionId) => void handleLoadSession(sessionId)}
             onDeleteSession={(sessionId) => void handleDeleteSession(sessionId)}
             courseRecovery={courseRecovery}
             onCourseRecoveryHandled={() => setCourseRecovery(null)}
           />
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
                            onClick={() => setTheme(theme === 'dark' ? 'eye-care' : 'dark')}
                            className={theme === 'eye-care' ? "h-9 w-9 bg-amber-100/50 text-amber-900 hover:bg-amber-200/50 rounded-xl" : "h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-white/50 rounded-xl"}
                            title={theme === 'dark' ? "切换到护眼亮色模式" : "切换到高对比夜间模式"}
                        >
                            {theme === 'dark' ? <BookOpen className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
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
                      className="shadow-md hover:shadow-lg transition-all duration-300 rounded-xl px-5 border-emerald-300 text-black dark:text-emerald-100 dark:border-emerald-400/60 dark:hover:bg-emerald-400/10 hover:bg-emerald-50 hover:border-emerald-400"
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
                                                    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">正在整理教学计划…</div>}>
                                                      <MarkdownContent content={teachingPlan} className="text-sm text-foreground leading-relaxed" />
                                                    </Suspense>
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
                                                <Suspense fallback={<div className="h-full grid place-items-center text-sm text-muted-foreground">正在打开学习助手…</div>}>
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
                                                      chatOptions={chatOptions}
                                                      onChatOptionsChange={setChatOptions}
                                                  />
                                                </Suspense>
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
                                    <Suspense fallback={<div className="h-full grid place-items-center text-sm text-muted-foreground">正在装载学习空间…</div>}>
                                      {showIDE ? (
                                          <IDEPanel />
                                      ) : (
                                          <div className="graph-workspace h-full relative bg-transparent">
                                              <KnowledgeGraph 
                                                  data={graphData} 
                                                  onNodeClick={handleNodeClick} 
                                                  onNodeContextMenu={handleNodeContextMenu}
                                                  theme={theme}
                                                  onViewModeChange={setGraphViewMode}
                                                  initialViewMode={graphViewMode}
                                              />
                                            <div className="graph-dashboard-layer absolute z-10">
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
                                    </Suspense>
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
