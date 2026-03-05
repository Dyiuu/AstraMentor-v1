"""
文档模式星图生成 Agent

从 PDF 文件内容中提取知识结构，生成知识星图。
与 KnowledgeGraphAgent 并行，独立服务于文档模式。
"""

import json
import logging
from typing import Dict, Any

from utils.api_client import APIClient
from models.knowledge_graph import KnowledgeGraph
from services.pdf_parser import DocumentContext
from core.doc_prompts import build_doc_graph_instruction

logger = logging.getLogger(__name__)


class DocGraphAgent:
    """
    文档模式星图生成 Agent

    NOTE: 与 KnowledgeGraphAgent 的区别：
    - 输入来源：从 DocumentContext 而非用户主题关键词
    - 节点约束：所有节点必须来源于文档实际内容
    - 节点附带原文引用：source_chunks 和 source_text
    """

    def __init__(self, api_client: APIClient):
        self.api_client = api_client
        logger.info("DocGraphAgent 初始化完成")

    def _build_doc_summary(self, doc_context: DocumentContext) -> str:
        """
        将文档分块组织为 LLM 可消费的摘要文本

        NOTE: 每个分块带有 chunk_id 标签，方便 AI 在生成节点时引用
        """
        parts: list[str] = []
        for chunk in doc_context.chunks:
            header = f"[{chunk.chunk_id}] 第{chunk.page_start}页"
            if chunk.heading:
                header += f" | {chunk.heading}"
            parts.append(f"{header}\n{chunk.content}")

        return "\n\n---\n\n".join(parts)

    def generate_knowledge_graph(
        self,
        doc_context: DocumentContext,
        complexity: int = 2,
    ) -> Dict[str, Any]:
        """
        基于文档内容生成知识星图

        Args:
            doc_context: PDF 解析后的文档上下文
            complexity: 复杂度档位（1=简洁 2=标准 3=详细）

        Returns:
            图谱数据字典
        """
        logger.info(
            f"正在为文档 '{doc_context.filename}' 生成知识星图"
            f"（复杂度: {complexity}）..."
        )

        system_instruction = build_doc_graph_instruction(complexity)

        # NOTE: 构建文档内容摘要，标注每个分块 ID 供 AI 引用
        doc_summary = self._build_doc_summary(doc_context)

        # NOTE: 限制注入长度，避免超出上下文窗口
        max_summary_length = 30000
        if len(doc_summary) > max_summary_length:
            doc_summary = doc_summary[:max_summary_length] + "\n\n[... 后续内容已省略 ...]"

        prompt = f"""以下是需要分析的文档内容：

文件名：{doc_context.filename}
总页数：{doc_context.total_pages}
分块数：{len(doc_context.chunks)}

【文档全文（按分块标注）】
{doc_summary}

请从以上文档内容中提取知识结构，生成知识星图。
注意：
1. 节点的 source_chunks 必须填写引用的分块 ID（如 ["chunk_1", "chunk_3"]）
2. 节点的 source_text 必须从文档原文中摘取对应的关键段落
3. 节点名称和描述必须忠实反映文档内容
"""

        try:
            graph_model = self.api_client.generate_json(
                prompt=prompt,
                system_instruction=system_instruction,
                temperature=0.2,
                output_schema=KnowledgeGraph,
            )

            graph_data = graph_model.model_dump()

            # NOTE: 确保 graph.topic 与文档关联
            if not graph_data.get("graph", {}).get("topic"):
                graph_data.setdefault("graph", {})["topic"] = doc_context.filename

            logger.info(
                f"✅ 文档星图生成成功，包含 {len(graph_data['nodes'])} 个节点"
            )
            return graph_data

        except Exception as e:
            logger.error(f"❌ 文档星图生成失败: {e}")
            raise
