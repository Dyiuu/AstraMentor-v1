import axios from 'axios';
import type { ChatMessage, GraphData, LearnerState, EvaluationResult, GroundingSource, TeachingResponse, CourseCitation, KnowledgeScope, SessionSnapshot, SessionSummary } from '../types';
import { toApiRequestError } from './errors';

export const API_BASE_URL = 'http://127.0.0.1:8000/api';

export const client = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

client.interceptors.response.use(
    (response) => response,
    (error: unknown) => Promise.reject(toApiRequestError(error)),
);

export const api = {
    getLearnerState: async () => {
        const response = await client.get<LearnerState>('/state');
        return response.data;
    },
    
    generateGraph: async (topic: string, goal: string, currentLevel: string, targetLevel: string, complexity: number = 2, courseId?: string) => {
        const response = await client.post<GraphData>('/graph/generate', {
            topic,
            learning_goal: goal,
            current_level: currentLevel,
            target_level: targetLevel,
            complexity,
            course_id: courseId,
        });
        return response.data;
    },

    startLearning: async (topic: string, nodeName: string, description: string, userNote: string, current: number, target: number, projectDescription: string = '', courseId?: string) => {
        const response = await client.post<TeachingResponse>('/learning/start', {
            topic,
            node_name: nodeName,
            node_description: description,
            user_note: userNote,
            current_mastery: current,
            target_mastery: target,
            project_description: projectDescription,
            course_id: courseId,
        });
        return response.data;
    },

    startLesson: async (topic: string, nodeName: string, courseId?: string) => {
        const response = await client.post<TeachingResponse>('/learning/lesson', { 
            topic,
            node_name: nodeName,
            node_description: "",
            user_note: "",
            current_mastery: 0,
            target_mastery: 0.8,
            course_id: courseId,
        });
        return response.data;
    },

    /** 推进到下一个教学步骤并自动讲解 */
    nextStep: async (topic: string, nodeName: string, courseId?: string) => {
        const response = await client.post<TeachingResponse>('/learning/next-step', {
            topic,
            node_name: nodeName,
            course_id: courseId,
        });
        return response.data;
    },

    /** 根据错误分析重新讲解当前步骤 */
    reteach: async (topic: string, nodeName: string, errorAnalysis: string = '', projectDescription: string = '', courseId?: string) => {
        const response = await client.post<TeachingResponse>('/learning/reteach', {
            topic,
            node_name: nodeName,
            error_analysis: errorAnalysis,
            project_description: projectDescription,
            course_id: courseId,
        });
        return response.data;
    },

    updateNode: async (topic: string, nodeName: string, userNote: string, current: number, target: number, courseId?: string) => {
        const response = await client.post<{ status: string }>('/learning/update', {
            topic,
            node_name: nodeName,
            user_note: userNote,
            current_mastery: current,
            target_mastery: target,
            course_id: courseId,
        });
        return response.data;
    },

    chat: async (topic: string, nodeName: string, question: string, history: Pick<ChatMessage, 'role' | 'content'>[], image?: string, projectDescription: string = '', courseId?: string) => {
        const response = await client.post<{ response: string; sources?: GroundingSource[]; citations?: CourseCitation[]; knowledge_scope?: KnowledgeScope }>('/learning/chat', {
            topic,
            node_name: nodeName,
            question,
            image,
            history,
            project_description: projectDescription,
            course_id: courseId,
        });
        return response.data;
    },

    generateQuestion: async (topic: string, nodeName: string, courseId?: string) => {
        const response = await client.post<{ question: string; question_id: string; citations?: CourseCitation[]; knowledge_scope?: KnowledgeScope }>('/learning/question', {
            topic,
            node_name: nodeName,
            course_id: courseId,
        });
        return response.data;
    },

    evaluateAnswer: async (topic: string, nodeName: string, question: string, answer: string, courseId?: string, questionId?: string) => {
        const response = await client.post<EvaluationResult>('/learning/evaluate', {
            topic,
            node_name: nodeName,
            question,
            answer,
            course_id: courseId,
            question_id: questionId,
        });
        return response.data;
    },

    runCode: async (code: string, language: string) => {
        const response = await client.post<{ output: string, error: string, exit_code: number }>('/run-code', {
            code,
            language
        });
        return response.data;
    },

    /** 将修改后的图谱数据保存到磁盘 JSON 文件 */
    saveGraph: async (topic: string, graphData: GraphData, courseId?: string) => {
        const response = await client.post<{ status: string }>('/graph/save', {
            topic,
            graph_data: graphData,
            course_id: courseId,
        });
        return response.data;
    },

    /** 删除星图对应的图谱文件和学习状态文件 */
    deleteGraph: async (topic: string, courseId?: string) => {
        const response = await client.delete<{ status: string }>('/graph/delete', {
            params: { topic, course_id: courseId }
        });
        return response.data;
    },

    /**
     * 在已有图谱上扩展新知识节点
     * AI 会自动生成中间过渡节点并建立递进层次连接
     */
    expandGraph: async (
        topic: string,
        newNodeName: string,
        currentMastery: number,
        targetMastery: number,
        userNote: string,
        existingGraph: GraphData,
        courseId?: string,
    ) => {
        const response = await client.post<GraphData>('/graph/expand', {
            topic,
            new_node_name: newNodeName,
            current_mastery: currentMastery,
            target_mastery: targetMastery,
            user_note: userNote,
            existing_graph: existingGraph,
            course_id: courseId,
        });
        return response.data;
    },

    /** 项目模式：根据项目描述生成技能学习路径星图 */
    generateProjectGraph: async (projectDescription: string, currentLevel: string, complexity: number = 2) => {
        const response = await client.post<GraphData>('/graph/generate-project', {
            project_description: projectDescription,
            current_level: currentLevel,
            complexity,
        });
        return response.data;
    },

    // =========================================================================
    // 文档模式 API（独立路由 /api/doc）
    // =========================================================================

    /** 上传 PDF 文件并解析 */
    uploadDocument: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await client.post<{
            doc_id: string;
            filename: string;
            total_pages: number;
            chunk_count: number;
        }>('/doc/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    /** 基于文档内容生成星图 */
    generateDocGraph: async (docId: string, complexity: number = 2) => {
        const response = await client.post<GraphData>('/doc/graph/generate', {
            doc_id: docId,
            complexity,
        });
        return response.data;
    },

    /** 文档模式：开始学习（生成教学计划） */
    docStartLearning: async (docId: string, nodeName: string, description: string = '', userNote: string = '', current: number = 0, target: number = 0.8) => {
        const response = await client.post<TeachingResponse>('/doc/learning/start', {
            doc_id: docId,
            node_name: nodeName,
            node_description: description,
            user_note: userNote,
            current_mastery: current,
            target_mastery: target,
        });
        return response.data;
    },

    /** 文档模式：开始讲课 */
    docStartLesson: async (docId: string, nodeName: string) => {
        const response = await client.post<TeachingResponse>('/doc/learning/lesson', {
            doc_id: docId,
            node_name: nodeName,
        });
        return response.data;
    },

    /** 文档模式：推进到下一步 */
    docNextStep: async (docId: string, nodeName: string) => {
        const response = await client.post<TeachingResponse>('/doc/learning/next-step', {
            doc_id: docId,
            node_name: nodeName,
        });
        return response.data;
    },

    /** 文档模式：重新讲解 */
    docReteach: async (docId: string, nodeName: string, errorAnalysis: string = '') => {
        const response = await client.post<TeachingResponse>('/doc/learning/reteach', {
            doc_id: docId,
            node_name: nodeName,
            error_analysis: errorAnalysis,
        });
        return response.data;
    },

    /** 文档模式：基于文档出题 */
    docGenerateQuestion: async (docId: string, nodeName: string) => {
        const response = await client.post<{ question: string; question_id: string; citations?: CourseCitation[]; knowledge_scope?: KnowledgeScope }>('/doc/learning/question', {
            doc_id: docId,
            node_name: nodeName,
        });
        return response.data;
    },

    /** 文档模式：基于文档评估 */
    docEvaluateAnswer: async (docId: string, nodeName: string, question: string, answer: string, questionId?: string) => {
        const response = await client.post<EvaluationResult>('/doc/learning/evaluate', {
            doc_id: docId,
            node_name: nodeName,
            question,
            answer,
            question_id: questionId,
        });
        return response.data;
    },

    /** 文档模式：基于文档讨论 */
    docChat: async (docId: string, nodeName: string, question: string, history: Pick<ChatMessage, 'role' | 'content'>[], image?: string) => {
        const response = await client.post<{ response: string; sources?: GroundingSource[]; citations?: CourseCitation[]; knowledge_scope?: KnowledgeScope }>('/doc/learning/chat', {
            doc_id: docId,
            node_name: nodeName,
            question,
            image,
            history,
        });
        return response.data;
    },

    /** 文档模式：删除文档星图 */
    docDeleteGraph: async (docId: string) => {
        const response = await client.delete<{ status: string }>('/doc/graph/delete', {
            params: { doc_id: docId },
        });
        return response.data;
    },

    listSessions: async (limit: number = 50) => {
        const response = await client.get<{ sessions: SessionSummary[] }>('/sessions', { params: { limit } });
        return response.data.sessions;
    },

    getSession: async (sessionId: string) => {
        const response = await client.get<SessionSnapshot>(`/sessions/${sessionId}`);
        return response.data;
    },

    saveSession: async (snapshot: SessionSnapshot) => {
        const response = await client.put<SessionSnapshot>(`/sessions/${snapshot.session_id}`, snapshot);
        return response.data;
    },

    deleteSession: async (sessionId: string) => {
        await client.delete(`/sessions/${sessionId}`);
    },
};
