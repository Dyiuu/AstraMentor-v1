from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class GenerateGraphRequest(BaseModel):
    topic: str
    learning_goal: Optional[str] = ""
    current_level: Optional[str] = "零基础"
    target_level: Optional[str] = "掌握核心概念"
    complexity: Optional[int] = 2  # 1=简洁 2=标准 3=详细

class StartLearningRequest(BaseModel):
    topic: str = ""
    node_name: str
    node_description: Optional[str] = ""
    user_note: Optional[str] = ""
    target_mastery: float = 0.8
    current_mastery: float = 0.0
    project_description: Optional[str] = ""  # 项目模式下的项目描述

class UpdateNodeRequest(BaseModel):
    topic: str = ""
    node_name: str
    user_note: Optional[str] = None
    target_mastery: Optional[float] = None
    current_mastery: Optional[float] = None

class ChatRequest(BaseModel):
    topic: str = ""
    node_name: str
    question: str
    image: Optional[str] = None
    history: List[Dict[str, str]] = []
    project_description: Optional[str] = ""  # 项目模式下的项目描述

class EvaluateRequest(BaseModel):
    topic: str = ""
    node_name: str
    question: str
    answer: str
    project_description: Optional[str] = ""  # 项目模式下的项目描述

class ReteachRequest(BaseModel):
    """根据错误分析重新讲解当前步骤"""
    topic: str = ""
    node_name: str
    error_analysis: str = ""
    project_description: Optional[str] = ""  # 项目模式下的项目描述

class GroundingSource(BaseModel):
    """搜索引用来源"""
    title: str = ""
    url: str = ""


class TeachingContentResponse(BaseModel):
    content: str
    sources: Optional[List[GroundingSource]] = None
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

class SaveGraphRequest(BaseModel):
    """保存/更新图谱数据到磁盘"""
    topic: str
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
    history: List[Dict[str, str]] = []

class DocEvaluateRequest(BaseModel):
    """文档模式评估请求"""
    doc_id: str
    node_name: str
    question: str
    answer: str

class DocReteachRequest(BaseModel):
    """文档模式重新讲解请求"""
    doc_id: str
    node_name: str
    error_analysis: str = ""
