from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class GenerateGraphRequest(BaseModel):
    topic: str
    learning_goal: Optional[str] = ""
    current_level: Optional[str] = "零基础"
    target_level: Optional[str] = "掌握核心概念"

class StartLearningRequest(BaseModel):
    node_name: str
    node_description: Optional[str] = ""
    user_note: Optional[str] = ""
    target_mastery: float = 0.8
    current_mastery: float = 0.0

class UpdateNodeRequest(BaseModel):
    node_name: str
    user_note: Optional[str] = None
    target_mastery: Optional[float] = None
    current_mastery: Optional[float] = None

class ChatRequest(BaseModel):
    node_name: str
    question: str
    image: Optional[str] = None
    history: List[Dict[str, str]] = []

class EvaluateRequest(BaseModel):
    node_name: str
    question: str
    answer: str

class GroundingSource(BaseModel):
    """搜索引用来源"""
    title: str = ""
    url: str = ""


class TeachingContentResponse(BaseModel):
    content: str
    sources: Optional[List[GroundingSource]] = None
    
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
