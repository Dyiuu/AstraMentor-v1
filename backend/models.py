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

class TeachingContentResponse(BaseModel):
    content: str
    
class EvaluationResponse(BaseModel):
    score: float
    feedback: str
    analysis: str
    is_mastered: bool
