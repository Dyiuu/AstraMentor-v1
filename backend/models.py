from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional, Dict, Any

class GenerateGraphRequest(BaseModel):
    topic: str
    course_id: Optional[str] = None
    learning_goal: Optional[str] = ""
    current_level: Optional[str] = "零基础"
    target_level: Optional[str] = "掌握核心概念"
    complexity: Optional[int] = 2  # 1=简洁 2=标准 3=详细

class StartLearningRequest(BaseModel):
    topic: str = ""
    course_id: Optional[str] = None
    node_name: str
    node_description: Optional[str] = ""
    user_note: Optional[str] = ""
    target_mastery: float = 0.8
    current_mastery: float = 0.0
    project_description: Optional[str] = ""  # 项目模式下的项目描述

class UpdateNodeRequest(BaseModel):
    topic: str = ""
    course_id: Optional[str] = None
    node_name: str
    user_note: Optional[str] = None
    target_mastery: Optional[float] = None
    current_mastery: Optional[float] = None

class ChatRequest(BaseModel):
    topic: str = ""
    course_id: Optional[str] = None
    node_name: str
    question: str
    image: Optional[str] = None
    history: List[Dict[str, str]] = Field(default_factory=list)
    project_description: Optional[str] = ""  # 项目模式下的项目描述
    max_tokens: int = Field(default=4096, ge=256, le=32768)
    thinking: bool = False

class EvaluateRequest(BaseModel):
    topic: str = ""
    course_id: Optional[str] = None
    node_name: str
    question: str
    answer: str
    project_description: Optional[str] = ""  # 项目模式下的项目描述
    question_id: Optional[str] = None

class ReteachRequest(BaseModel):
    """根据错误分析重新讲解当前步骤"""
    topic: str = ""
    course_id: Optional[str] = None
    node_name: str
    error_analysis: str = ""
    project_description: Optional[str] = ""  # 项目模式下的项目描述

class GroundingSource(BaseModel):
    """搜索引用来源"""
    title: str = ""
    url: str = ""


class CourseCitation(BaseModel):
    citation_id: str
    course_id: str
    document_title: str
    section_path: List[str] = Field(default_factory=list)
    excerpt: str
    source_file: str
    line_start: int
    line_end: int
    score: float = 0.0
    retrieval: str = "bm25"


class TeachingContentResponse(BaseModel):
    content: str
    sources: Optional[List[GroundingSource]] = None
    citations: List[CourseCitation] = Field(default_factory=list)
    knowledge_scope: str = "extension"
    # NOTE: 步骤进度字段，用于前端展示教学计划推进状态
    current_step: Optional[int] = None
    total_steps: Optional[int] = None
    is_plan_completed: Optional[bool] = None
    
class EvaluationResponse(BaseModel):
    score: float
    feedback: str
    analysis: str
    is_mastered: bool
    new_mastery: float
    citations: List[CourseCitation] = Field(default_factory=list)
    knowledge_scope: str = "extension"
    question_id: Optional[str] = None

class SaveGraphRequest(BaseModel):
    """保存/更新图谱数据到磁盘"""
    topic: str
    course_id: Optional[str] = None
    graph_data: Dict[str, Any]


class RunCodeRequest(BaseModel):
    code: str
    language: str

class RunCodeResponse(BaseModel):
    output: str
    error: str
    exit_code: int


class AddNodeRequest(BaseModel):
    """图谱扩展请求：用户手动添加知识节点"""
    topic: str
    course_id: Optional[str] = None
    new_node_name: str
    current_mastery: float = 0.0
    target_mastery: float = 0.8
    user_note: str = ""
    existing_graph: Dict[str, Any]


class GenerateProjectGraphRequest(BaseModel):
    """项目模式星图生成请求"""
    project_description: str  # 用户的项目描述
    current_level: str = "零基础"
    complexity: int = 2  # 1=简洁 2=标准 3=详细


# ============================================================================
# 文档模式专用模型
# ============================================================================

class UploadDocumentResponse(BaseModel):
    """PDF 上传响应"""
    doc_id: str
    filename: str
    total_pages: int
    chunk_count: int

class GenerateDocGraphRequest(BaseModel):
    """文档模式星图生成请求"""
    doc_id: str
    complexity: Optional[int] = 2

class DocStartLearningRequest(BaseModel):
    """文档模式开始学习请求"""
    doc_id: str
    node_name: str
    node_description: Optional[str] = ""
    user_note: Optional[str] = ""
    target_mastery: float = 0.8
    current_mastery: float = 0.0

class DocChatRequest(BaseModel):
    """文档模式讨论请求"""
    doc_id: str
    node_name: str
    question: str
    image: Optional[str] = None
    history: List[Dict[str, str]] = Field(default_factory=list)
    max_tokens: int = Field(default=4096, ge=256, le=32768)
    thinking: bool = False

class DocEvaluateRequest(BaseModel):
    """文档模式评估请求"""
    doc_id: str
    node_name: str
    question: str
    answer: str
    question_id: Optional[str] = None

class DocReteachRequest(BaseModel):
    """文档模式重新讲解请求"""
    doc_id: str
    node_name: str
    error_analysis: str = ""


class CourseSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    top_k: int = Field(default=5, ge=1, le=20)


class SessionSnapshotRequest(BaseModel):
    """Flexible, versioned UI session snapshot persisted by the backend."""

    model_config = ConfigDict(extra="allow")

    schema_version: int = 1
    session_id: str = Field(min_length=1, max_length=128)
    mode: str = "topic"
    title: str = "未命名学习"
    internal_topic: str = ""
    course_id: Optional[str] = None
    course_title: Optional[str] = None
    graph_data: Dict[str, Any] = Field(default_factory=dict)
    node_sessions: Dict[str, Any] = Field(default_factory=dict)
    selected_node: Optional[Dict[str, Any]] = None
    step_progress: Optional[Dict[str, int]] = None
    learning_goal: str = ""
    current_level: str = ""
    learner_state: Optional[Dict[str, Any]] = None
    average_mastery: float = 0.0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    doc_id: Optional[str] = None
    doc_filename: Optional[str] = None
    project_description: Optional[str] = None
