import axios from 'axios';
import type { GraphData, LearnerState, EvaluationResult, GroundingSource } from '../types';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

const client = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const api = {
    getLearnerState: async () => {
        const response = await client.get<LearnerState>('/state');
        return response.data;
    },
    
    generateGraph: async (topic: string, goal: string, currentLevel: string, targetLevel: string) => {
        const response = await client.post<GraphData>('/graph/generate', {
            topic,
            learning_goal: goal,
            current_level: currentLevel,
            target_level: targetLevel,
        });
        return response.data;
    },

    startLearning: async (nodeName: string, description: string, userNote: string, current: number, target: number) => {
        const response = await client.post<{ content: string }>('/learning/start', {
            node_name: nodeName,
            node_description: description,
            user_note: userNote,
            current_mastery: current,
            target_mastery: target
        });
        return response.data;
    },

    startLesson: async (nodeName: string) => {
        const response = await client.post<{ content: string; sources?: GroundingSource[] }>('/learning/lesson', { 
            node_name: nodeName,
            node_description: "",
            user_note: "",
            current_mastery: 0,
            target_mastery: 0.8
        });
        return response.data;
    },

    updateNode: async (nodeName: string, userNote: string, current: number, target: number) => {
        const response = await client.post<{ status: string }>('/learning/update', {
            node_name: nodeName,
            user_note: userNote,
            current_mastery: current,
            target_mastery: target
        });
        return response.data;
    },

    chat: async (nodeName: string, question: string, history: any[], image?: string) => {
        const response = await client.post<{ response: string; sources?: GroundingSource[] }>('/learning/chat', {
            node_name: nodeName,
            question,
            image,
            history
        });
        return response.data;
    },

    generateQuestion: async (nodeName: string) => {
        const response = await client.post<{ question: string }>('/learning/question', {
            node_name: nodeName
        });
        return response.data;
    },

    evaluateAnswer: async (nodeName: string, question: string, answer: string) => {
        const response = await client.post<EvaluationResult>('/learning/evaluate', {
            node_name: nodeName,
            question,
            answer
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
    saveGraph: async (topic: string, graphData: any) => {
        const response = await client.post<{ status: string }>('/graph/save', {
            topic,
            graph_data: graphData
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
        existingGraph: GraphData
    ) => {
        const response = await client.post<GraphData>('/graph/expand', {
            topic,
            new_node_name: newNodeName,
            current_mastery: currentMastery,
            target_mastery: targetMastery,
            user_note: userNote,
            existing_graph: existingGraph
        });
        return response.data;
    }
};
