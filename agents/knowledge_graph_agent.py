"""
KnowledgeGraph Agent - 知识星图生成器
生成topic下的知识节点及依赖关系，支持主题模式和项目模式
"""

import logging
from typing import Dict, Any, List

from utils.api_client import APIClient
from models.knowledge_graph import KnowledgeGraph, ExpandGraphResult
from config import get_config
from utils.web_research import build_research_context
from core.prompts import get_project_graph_system_instruction

logger = logging.getLogger(__name__)


class KnowledgeGraphAgent:
    """
    知识星图生成Agent
    """

    SYSTEM_INSTRUCTION = """你是一位专业的知识星图架构师。

你的任务是：根据用户的学习主题、目标和当前水平，生成一个结构化的知识星图。

输出要求：
1. 使用 JSON Schema 定义的 KnowledgeGraph 格式
2. graph.topic 必须填写用户的学习主题
3. graph.name 设置为 "{主题} 学习路线图" 的格式
4. nodes 包含 5-15 个知识节点，每个节点需要：
   - id: 唯一标识符（如 "node_1", "node_2"）
   - name: 知识点名称（简洁明确）
   - attributes.weight_A: 根据用户当前水平设置（0.0-1.0）
     * 如果用户可能已掌握该知识点，设置为 0.6-0.9
     * 如果用户完全不懂，设置为 0.0-0.2
   - attributes.weight_B: 根据用户目标设置（0.0-1.0）
     * 如果该知识点对达成目标很重要，设置为 0.8-0.95
     * 如果该知识点只需了解即可，设置为 0.5-0.7
   - attributes.description: 1-2句话描述该知识点的核心内容和学习要点
   - attributes.user_note: 留空（用于用户后续填写个性化备注）
5. links 定义节点间的依赖关系：
   - source: 前置知识节点ID
   - target: 后续知识节点ID  
   - reason: 清晰说明为什么存在这个依赖
   - weight: 依赖强度（0.0-1.0）

设计原则：
- 节点粒度适中：每个节点是独立的教学单元
- 依赖清晰：确保是DAG（有向无环图）
- 个性化：根据用户的当前水平和目标，合理设置每个节点的 weight_A 和 weight_B
- 循序渐进：确保学习路径符合认知规律（先易后难）
- 严格层级：尽量只连接相邻或相近层级的节点，避免跨越大层级的"长连接"（例如不要从基础概念直接连到高级应用，中间应有进阶概念过渡）
- 树状结构：倾向于生成类似二叉树或多叉树的结构，减少网状交叉
"""

    # NOTE: 图谱扩展专用提示词
    # 与初始生成不同，扩展需要在已有图谱基础上自然过渡到新节点
    EXPAND_SYSTEM_INSTRUCTION = """你是一位专业的知识星图架构师，负责在已有知识图谱上扩展新知识节点。

你的任务是：分析已有图谱结构，将用户指定的新知识节点自然地融入图谱中。

核心原则：
1. **自然过渡**：如果新节点与已有节点之间存在知识跨度，必须生成适当数量的中间过渡节点来桥接。不要限制数量，以能从已有节点自然递进到新节点为准。
2. **递进层次**：所有连接只在相邻或相近层级之间建立，严禁跨越大层级的长连接。
3. **融入已有结构**：新增连接必须与已有图谱的某些节点建立关系（source 或 target 使用已有节点ID），不能孤立存在。
4. **保持 DAG**：确保新增连接不会引入环路（有向无环图）。
5. **避免冗余**：不要生成与已有节点重复或高度相似的知识点。

输出要求（ExpandGraphResult 格式）：
- new_nodes: 所有新增节点列表（包括中间过渡节点和用户指定的目标节点）
  - id: 唯一标识符，使用 "expand_node_1", "expand_node_2" 格式，避免与已有 ID 冲突
  - name: 知识点名称（简洁明确）
  - attributes.weight_A: 用户的当前掌握度（对中间过渡节点，参考用户对相邻已有节点的掌握度合理推断）
  - attributes.weight_B: 期望掌握度（对中间过渡节点，根据学习路径重要性合理设置）
  - attributes.description: 1-2句话描述该知识点的核心内容
  - attributes.user_note: 留空
- new_links: 所有新增连接列表
  - source/target 可以混合使用已有节点ID和新增节点ID
  - reason: 清晰说明依赖关系
  - weight: 关联强度（0.0-1.0）

重要提醒：
- 用户指定的目标节点必须包含在 new_nodes 中（使用用户提供的名称和参数）
- 中间过渡节点的数量完全取决于知识跨度，可能是 0 个也可能是多个
- 优先与已有图谱中掌握度较高或主题最相关的节点建立连接
"""

    # NOTE: 复杂度档位配置，控制星图生成的节点数量和结构描述
    # 由前端分段滑块传入，1=简洁，2=标准（默认），3=详细
    COMPLEXITY_LEVELS = {
        1: {
            "node_range": "4-7",
            "desc": "只保留核心主干知识点，结构尽量简洁，适合快速入门或时间有限的学习者",
        },
        2: {
            "node_range": "8-12",
            "desc": "覆盖主要分支，保持适中的广度和深度，适合系统学习",
        },
        3: {
            "node_range": "13-20",
            "desc": "深入展开所有分支和细节，覆盖尽可能完善，适合深度钻研",
        },
    }

    def __init__(self, api_client: APIClient):
        self.api_client = api_client
        logger.info("KnowledgeGraphAgent 初始化完成")

    def _build_system_instruction(self, complexity: int = 2) -> str:
        """
        根据复杂度档位动态生成系统提示词

        NOTE: 将 SYSTEM_INSTRUCTION 模板中的节点数量约束
        替换为对应档位的范围和结构描述
        """
        level = self.COMPLEXITY_LEVELS.get(complexity, self.COMPLEXITY_LEVELS[2])
        node_range = level["node_range"]
        desc = level["desc"]

        return f"""你是一位专业的知识星图架构师。

你的任务是：根据用户的学习主题、目标和当前水平，生成一个结构化的知识星图。

输出要求：
1. 使用 JSON Schema 定义的 KnowledgeGraph 格式
2. graph.topic 必须填写用户的学习主题
3. graph.name 设置为 "{{主题}} 学习路线图" 的格式
4. nodes 包含 {node_range} 个知识节点（{desc}），每个节点需要：
   - id: 唯一标识符（如 "node_1", "node_2"）
   - name: 知识点名称（简洁明确）
   - attributes.weight_A: 根据用户当前水平设置（0.0-1.0）
     * 如果用户可能已掌握该知识点，设置为 0.6-0.9
     * 如果用户完全不懂，设置为 0.0-0.2
   - attributes.weight_B: 根据用户目标设置（0.0-1.0）
     * 如果该知识点对达成目标很重要，设置为 0.8-0.95
     * 如果该知识点只需了解即可，设置为 0.5-0.7
   - attributes.description: 1-2句话描述该知识点的核心内容和学习要点
   - attributes.user_note: 留空（用于用户后续填写个性化备注）
5. links 定义节点间的依赖关系：
   - source: 前置知识节点ID
   - target: 后续知识节点ID  
   - reason: 清晰说明为什么存在这个依赖
   - weight: 依赖强度（0.0-1.0）

设计原则：
- 节点粒度适中：每个节点是独立的教学单元
- 依赖清晰：确保是DAG（有向无环图）
- 个性化：根据用户的当前水平和目标，合理设置每个节点的 weight_A 和 weight_B
- 循序渐进：确保学习路径符合认知规律（先易后难）
- 严格层级：尽量只连接相邻或相近层级的节点，避免跨越大层级的"长连接"（例如不要从基础概念直接连到高级应用，中间应有进阶概念过渡）
- 树状结构：倾向于生成类似二叉树或多叉树的结构，减少网状交叉
"""

    def generate_knowledge_graph(
        self,
        topic: str,
        learning_goal: str = "",
        current_level: str = "零基础",
        target_level: str = "掌握核心概念",
        complexity: int = 2,
    ) -> Dict[str, Any]:
        """
        生成知识星图

        Args:
            topic: 学习主题（如"Python异步编程"）
            learning_goal: 学习目的（如"用于开发高性能Web服务"）
            current_level: 当前水平描述（如"零基础"、"了解基础语法"、"有一定项目经验"）
            target_level: 目标水平描述（如"掌握核心概念"、"能独立开发项目"、"达到专家水平"）
            complexity: 复杂度档位（1=简洁 2=标准 3=详细）

        Returns:
            图谱数据字典（从 Pydantic 模型转换）
        """
        # 构建用户输入上下文（只包含用户信息，不包含规则）
        prompt = f"""学习主题：{topic}

学习目的：{learning_goal if learning_goal else "系统学习该主题"}

我的当前水平：{current_level}

当前水平中列出的“已具备”能力属于先修背景，不得再次生成为知识节点。

我的目标水平：{target_level}

请为我生成个性化的知识星图。"""

        logger.info(f"正在为主题 '{topic}' 生成知识星图（复杂度: {complexity}）...")

        # NOTE: 根据复杂度档位动态构建系统提示词
        system_instruction = self._build_system_instruction(complexity)

        try:
            # NOTE: 先联网搜索获取背景知识，再注入 prompt 生成结构化 JSON
            research_context = ""
            config = get_config()
            if config.api.web_search_enabled:
                try:
                    research_context = build_research_context(
                        f"{topic} 学习路线 知识结构 核心概念", max_results=5
                    )
                    if research_context:
                        logger.info(f"✅ 主题 '{topic}' 的搜索预研完成")
                except Exception as e:
                    # HACK: 搜索失败不应阻塞星图生成，回退到无搜索模式
                    logger.warning(f"搜索预研失败，回退到无搜索模式: {e}")

            # 第二阶段：将搜索结果注入 prompt 生成结构化 JSON
            if research_context:
                prompt += f"\n\n【联网搜索参考资料】\n{research_context}\n\n请基于以上搜索结果，结合你的专业知识，生成更准确、更完善的知识星图。"

            # 使用结构化输出
            graph_model = self.api_client.generate_json(
                prompt=prompt,
                system_instruction=system_instruction,
                temperature=0.2,
                output_schema=KnowledgeGraph,
            )

            graph_data = graph_model.model_dump()

            logger.info(f"✅ 知识星图生成成功，包含 {len(graph_data['nodes'])} 个节点")
            return graph_data

        except Exception as e:
            logger.error(f"❌ 知识星图生成失败: {e}")
            raise

    def generate_project_graph(
        self,
        project_description: str,
        current_level: str = "零基础",
        complexity: int = 2,
    ) -> Dict[str, Any]:
        """
        根据项目描述生成学习路径星图

        NOTE: 与 generate_knowledge_graph 不同，此方法按「完成项目所需技能」
        组织节点，每个节点代表一项具体技能而非知识概念。

        Args:
            project_description: 用户想要完成的项目描述
            current_level: 当前水平描述（如"零基础"、"有一定编程经验"）
            complexity: 复杂度档位（1=简洁 2=标准 3=详细）

        Returns:
            图谱数据字典（与 generate_knowledge_graph 格式一致）
        """
        prompt = f"""用户想要完成的项目：
{project_description}

用户的当前水平：{current_level}

请分析这个项目需要哪些技能，并生成一个面向项目完成的技能学习路径图。"""

        logger.info(f"正在为项目生成技能路径星图（复杂度: {complexity}）...")

        system_instruction = get_project_graph_system_instruction(complexity)

        try:
            # NOTE: 联网搜索项目相关技术栈信息
            research_context = ""
            config = get_config()
            if config.api.web_search_enabled:
                try:
                    # 提取项目关键词用于搜索
                    research_context = build_research_context(
                        f"{project_description} 技术栈 所需技能 学习路线",
                        max_results=5,
                    )
                    if research_context:
                        logger.info("✅ 项目技术栈搜索预研完成")
                except Exception as e:
                    logger.warning(f"搜索预研失败，回退到无搜索模式: {e}")

            if research_context:
                prompt += f"\n\n【联网搜索参考资料】\n{research_context}\n\n请基于以上搜索结果，生成更准确的项目技能路径图。"

            graph_model = self.api_client.generate_json(
                prompt=prompt,
                system_instruction=system_instruction,
                temperature=0.2,
                output_schema=KnowledgeGraph,
            )

            graph_data = graph_model.model_dump()

            logger.info(
                f"✅ 项目技能路径星图生成成功，包含 {len(graph_data['nodes'])} 个节点"
            )
            return graph_data

        except Exception as e:
            logger.error(f"❌ 项目技能路径星图生成失败: {e}")
            raise

    def expand_graph(
        self,
        existing_graph_data: Dict[str, Any],
        new_node_name: str,
        current_mastery: float = 0.0,
        target_mastery: float = 0.8,
        user_note: str = "",
        course_context: str = "",
    ) -> Dict[str, Any]:
        """
        在已有图谱基础上扩展新节点

        AI 会分析已有结构，生成适当的中间过渡节点，
        并建立与原图谱的递进层次连接。

        Args:
            existing_graph_data: 当前完整图谱数据
            new_node_name: 用户要添加的目标节点名称
            current_mastery: 用户对该节点的当前掌握度
            target_mastery: 期望掌握度
            user_note: 用户备注
            course_context: 当前课程检索得到的教材证据

        Returns:
            扩展结果字典（包含 new_nodes 和 new_links）
        """
        import json

        # NOTE: 将已有图谱序列化后传给 AI，让它了解当前结构
        existing_summary = json.dumps(existing_graph_data, ensure_ascii=False, indent=2)

        prompt = f"""已有知识图谱结构如下：
{existing_summary}

用户要添加的新知识节点：
- 名称：{new_node_name}
- 当前掌握度（weight_A）：{current_mastery}
- 期望掌握度（weight_B）：{target_mastery}
- 用户备注：{user_note if user_note else "无"}

请分析已有图谱，将这个新节点自然融入其中。如果新节点与已有节点之间存在知识跨度，请生成适当的中间过渡节点来桥接。"""

        if course_context:
            prompt += (
                "\n\n【当前课程教材证据】\n"
                f"{course_context}\n"
                "优先依据以上证据确定节点边界和前置关系，不得引用其他课程内容。"
            )

        logger.info(f"正在扩展图谱，添加节点 '{new_node_name}'...")

        try:
            # NOTE: 先搜索新节点相关知识再生成结构化扩展
            config = get_config()
            if config.api.web_search_enabled:
                try:
                    research_ctx = build_research_context(
                        f"{new_node_name} 知识点 前置依赖 进阶", max_results=3
                    )
                    if research_ctx:
                        prompt += f"\n\n【联网搜索参考资料】\n{research_ctx}"
                        logger.info(f"✅ 节点 '{new_node_name}' 的搜索预研完成")
                except Exception as e:
                    logger.warning(f"搜索预研失败，回退: {e}")

            expand_result = self.api_client.generate_json(
                prompt=prompt,
                system_instruction=self.EXPAND_SYSTEM_INSTRUCTION,
                temperature=0.2,
                output_schema=ExpandGraphResult,
            )

            result_data = expand_result.model_dump()

            new_node_count = len(result_data.get("new_nodes", []))
            new_link_count = len(result_data.get("new_links", []))
            logger.info(
                f"✅ 图谱扩展成功，新增 {new_node_count} 个节点、{new_link_count} 条连接"
            )
            return result_data

        except Exception as e:
            logger.error(f"❌ 图谱扩展失败: {e}")
            raise

    def get_learning_path(self, graph_data: Dict[str, Any]) -> List[str]:
        """
        拓扑排序生成学习路径

        Returns:
            节点ID的排序列表
        """
        from collections import defaultdict, deque

        nodes = graph_data["nodes"]
        links = graph_data.get("links", [])  # 使用新的 links 字段

        # 构建图
        graph = defaultdict(list)
        in_degree = {node["id"]: 0 for node in nodes}

        for link in links:
            graph[link["source"]].append(link["target"])
            in_degree[link["target"]] += 1

        # Kahn算法
        queue = deque([nid for nid, deg in in_degree.items() if deg == 0])
        path = []

        while queue:
            current = queue.popleft()
            path.append(current)

            for neighbor in graph[current]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        return path

    def format_graph_summary(self, graph_data: Dict[str, Any]) -> str:
        """
        生成图谱的文字摘要

        Returns:
            可读的摘要文字
        """
        nodes = graph_data["nodes"]
        links = graph_data.get("links", [])

        summary = f"📊 知识星图包含 {len(nodes)} 个知识点，{len(links)} 个依赖关系\n\n"

        # 列出所有节点
        summary += "📚 知识节点：\n"
        for i, node in enumerate(nodes, 1):
            summary += f"  {i}. {node['name']}\n"

        return summary
