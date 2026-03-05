"""
知识星图数据模型

使用 Pydantic 定义结构化输出格式
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class NodeAttributes(BaseModel):
    """节点属性"""

    weight_A: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="当前掌握程度 (Current Mastery)",
    )
    weight_B: float = Field(
        default=0.8,
        ge=0.0,
        le=1.0,
        description="目标掌握程度 (Target Proficiency)",
    )
    description: str = Field(default="", description="知识点描述（AI生成）")
    user_note: str = Field(default="", description="用户个性化备注")
    # NOTE: 以下两个字段仅在文档模式下使用，主题模式下为空
    source_chunks: list[str] = Field(
        default_factory=list,
        description="关联的原文分块 ID 列表（仅文档模式使用）",
    )
    source_text: str = Field(
        default="",
        description="节点对应的原文摘要（仅文档模式使用）",
    )
    last_updated: Optional[str] = Field(
        default_factory=lambda: datetime.now().strftime("%Y-%m-%d"),
        description="最后更新时间",
    )


class KnowledgeNode(BaseModel):
    """知识节点"""

    id: str = Field(..., description="唯一标识符")
    name: str = Field(..., description="知识点名称")
    attributes: NodeAttributes = Field(
        default_factory=NodeAttributes, description="节点属性"
    )


class KnowledgeLink(BaseModel):
    """知识依赖关系（边）"""

    source: str = Field(..., description="起点节点ID（前置知识）")
    target: str = Field(..., description="终点节点ID（后续知识）")
    reason: Optional[str] = Field(default="", description="依赖关系说明")
    weight: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="关联强度 (0.0-1.0)",
    )


class GraphMetadata(BaseModel):
    """图谱元数据"""

    name: str = Field(default="Knowledge_Graph", description="图谱名称")
    version: str = Field(default="1.0", description="版本号")
    topic: str = Field(..., description="学习主题")


class KnowledgeGraph(BaseModel):
    """完整的知识星图"""

    directed: bool = Field(default=True, description="")
    multigraph: bool = Field(default=False, description="")
    graph: GraphMetadata = Field(
        default_factory=GraphMetadata, description="图谱元数据"
    )
    nodes: list[KnowledgeNode] = Field(default_factory=list, description="知识节点列表")
    links: list[KnowledgeLink] = Field(
        default_factory=list, description="知识依赖关系列表"
    )


class ExpandGraphResult(BaseModel):
    """图谱扩展结果：仅包含新增的节点和连接"""

    new_nodes: list[KnowledgeNode] = Field(
        default_factory=list, description="新增知识节点列表（含中间过渡节点和目标节点）"
    )
    new_links: list[KnowledgeLink] = Field(
        default_factory=list, description="新增知识依赖关系列表（连接新旧节点）"
    )
