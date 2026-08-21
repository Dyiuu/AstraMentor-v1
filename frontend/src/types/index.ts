export interface KnowledgePoint {
    name: string;
    actual_mastery: number;
    target_mastery: number;
    note: string;
    history: unknown[];
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
    [key: string]: unknown;
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
    graph?: {
        topic?: string;
        [key: string]: unknown;
    };
}

export interface GroundingSource {
    title: string;
    url: string;
}

export interface CourseCitation {
    citation_id: string;
    course_id: string;
    document_title: string;
    section_path: string[];
    excerpt: string;
    source_file: string;
    line_start: number;
    line_end: number;
    score: number;
    retrieval: 'bm25' | 'hybrid' | string;
}

export type KnowledgeScope = 'course' | 'extension' | 'mixed' | 'document';

export type CourseIndexState = 'ready' | 'missing' | 'stale' | 'building' | 'failed';

export type CourseLevel = 'foundation' | 'intermediate' | 'advanced' | 'unspecified';

export interface CourseIndexStatus {
    status: CourseIndexState;
    course_id: string;
    chunk_count: number;
    message: string;
    built_at: string;
}

export interface CourseMaterial {
    id: string;
    title: string;
    path: string;
    relative_path: string;
}

export interface Course {
    id: string;
    title: string;
    description: string;
    locale: string;
    version: string;
    category: string;
    order: number;
    hours: number;
    level: CourseLevel;
    track: string;
    prerequisite_skills: string[];
    recommended_courses: string[];
    job_roles: string[];
    competencies: string[];
    capstone: string;
    tags: string[];
    materials: CourseMaterial[];
    index: CourseIndexStatus;
}

export interface CourseIndexNotReadyDetail {
    code: 'course_index_not_ready';
    course_id: string;
    status: CourseIndexState;
    message: string;
}

export interface QuizContextStaleDetail {
    code: 'quiz_context_stale';
    message: string;
}

export interface CourseIndexRecovery {
    courseId: string;
    status: CourseIndexState;
    message: string;
}

export interface ChatMessage {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    reasoning?: string;
    isStreaming?: boolean;
    image?: string;
    timestamp?: number;
    sources?: GroundingSource[];
    citations?: CourseCitation[];
    knowledgeScope?: KnowledgeScope;
}

export interface EvaluationResult {
    score: number;
    feedback: string;
    analysis: string;
    is_mastered: boolean;
    new_mastery: number;
    citations?: CourseCitation[];
    knowledge_scope?: KnowledgeScope;
    question_id?: string;
}

export interface ChatOptions {
    maxTokens: number;
    thinking: boolean;
}

export interface SessionSummary {
    session_id: string;
    mode: string;
    title: string;
    course_id?: string;
    course_title?: string;
    last_node_id?: string;
    last_node_name?: string;
    current_step?: number;
    total_steps?: number;
    average_mastery: number;
    created_at?: string;
    updated_at?: string;
}

export interface SessionSnapshot {
    schema_version: number;
    session_id: string;
    mode: string;
    title: string;
    internal_topic: string;
    course_id?: string;
    course_title?: string;
    graph_data: GraphData;
    node_sessions: Record<string, unknown>;
    selected_node?: { id: string; name: string; attributes?: GraphNodeAttributes } | null;
    step_progress?: { current: number; total: number } | null;
    learning_goal: string;
    current_level: string;
    learner_state?: LearnerState | null;
    average_mastery: number;
    created_at?: string;
    updated_at?: string;
    doc_id?: string;
    doc_filename?: string;
    project_description?: string;
}

export interface TeachingResponse {
    content: string;
    sources?: GroundingSource[];
    citations?: CourseCitation[];
    knowledge_scope?: KnowledgeScope;
    current_step?: number;
    total_steps?: number;
    is_plan_completed?: boolean;
}
