export interface KnowledgePoint {
    name: string;
    actual_mastery: number;
    target_mastery: number;
    note: string;
    history: any[];
    created_at: string;
    updated_at: string;
}

export interface LearnerState {
    total: number;
    mastered: number;
    average_mastery: number;
}

export interface GraphNodeAttributes {
    weight_A?: number; // Current mastery
    weight_B?: number; // Target mastery
    description?: string;
    user_note?: string;
    [key: string]: any;
}

export interface GraphNode {
    id: string;
    name: string;
    attributes: GraphNodeAttributes;
}

export interface GraphLink {
    source: string;
    target: string;
    reason: string;
    weight: number;
}

export interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
}

export interface GroundingSource {
    title: string;
    url: string;
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    image?: string;
    timestamp?: number;
    sources?: GroundingSource[];
}

export interface EvaluationResult {
    score: number;
    feedback: string;
    analysis: string;
    is_mastered: boolean;
    new_mastery: number;
}
