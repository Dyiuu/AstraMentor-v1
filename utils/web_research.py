"""
Web Research 工具模块

使用 DuckDuckGo 搜索引擎实现独立的联网搜索能力。
搜索结果会被注入到 LLM prompt 中，让 AI 基于最新信息生成回答。
"""

import logging
from dataclasses import dataclass, field
from typing import List, Optional

logger = logging.getLogger(__name__)


@dataclass
class GroundingSource:
    """单条搜索引用来源"""
    title: str
    url: str


@dataclass
class SearchGroundedResponse:
    """
    带搜索来源的响应结果

    包含 LLM 生成的文本内容和搜索引用来源列表。
    """
    content: str
    sources: List[GroundingSource] = field(default_factory=list)
    search_queries: List[str] = field(default_factory=list)


def web_search(query: str, max_results: int = 5) -> List[dict]:
    """
    使用 DuckDuckGo 搜索引擎执行搜索

    Args:
        query: 搜索查询词
        max_results: 最大返回结果数

    Returns:
        搜索结果列表，每个结果包含 title, href, body
    """
    try:
        from ddgs import DDGS

        results = list(DDGS().text(query, max_results=max_results))
        logger.info(f"DuckDuckGo 搜索 '{query[:50]}...' 返回 {len(results)} 条结果")
        return results

    except ImportError as e:
        import traceback
        logger.error(f"ddgs 导入失败: {e}\n{traceback.format_exc()}")
        return []
    except Exception as e:
        logger.warning(f"DuckDuckGo 搜索失败: {e}")
        return []


def build_search_context(query: str, max_results: int = 5) -> tuple[str, List[GroundingSource]]:
    """
    执行搜索并构建可注入 prompt 的上下文字符串

    NOTE: 这是两阶段方案的核心——先搜索获取最新信息，
    再将搜索结果作为上下文传给 LLM。

    Args:
        query: 搜索查询词
        max_results: 最大结果数

    Returns:
        (上下文字符串, 来源列表) 元组
    """
    results = web_search(query, max_results=max_results)

    if not results:
        return "", []

    sources: List[GroundingSource] = []
    context_parts = [f"【搜索查询】{query}\n"]
    context_parts.append("【搜索结果】")

    for i, result in enumerate(results, 1):
        title = result.get("title", "")
        url = result.get("href", "")
        body = result.get("body", "")

        context_parts.append(f"\n[{i}] {title}")
        if body:
            context_parts.append(f"    {body}")

        if url:
            sources.append(GroundingSource(title=title, url=url))

    context_str = "\n".join(context_parts)
    return context_str, sources


def build_research_context(query: str, max_results: int = 5) -> str:
    """
    执行搜索并返回完整的研究上下文字符串

    NOTE: 简化接口版本，仅返回上下文字符串，不返回来源列表。
    用于 KnowledgeGraphAgent 两阶段方案。

    Args:
        query: 搜索查询词
        max_results: 最大结果数

    Returns:
        格式化的搜索上下文字符串
    """
    context_str, _ = build_search_context(query, max_results)
    return context_str
