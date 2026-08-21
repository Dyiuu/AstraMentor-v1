import logging
import json
import uuid
import hashlib
import re
from pathlib import Path
from typing import Optional, Dict, List, Any
from datetime import datetime

from agents.teacher_agent import TeacherAgent
from agents.evaluation_agent import EvaluationAgent
from agents.knowledge_graph_agent import KnowledgeGraphAgent
from core.learner_state import LearnerState, KnowledgePoint
from core.constants import LearningLevel
from core.prompts import build_project_context_injection
from utils.api_client import APIClient
from rag.citations import build_course_context, citations_from_results
from rag.course_registry import COURSE_ID_PATTERN
from rag.errors import CourseIndexNotReadyError
from rag.retriever import CourseRetriever, RetrievalResult

logger = logging.getLogger(__name__)


class QuizContextError(ValueError):
    """The requested quiz no longer matches the completed lesson step."""

class LearningService:
    """
    Core service for AstraMentor learning logic.
    Decoupled from CLI/Web interfaces.
    """

    TEST_DATA_ROOT = Path("test_data")

    def __init__(self, topic: str = "", course_id: str = ""):
        if course_id and not COURSE_ID_PATTERN.fullmatch(course_id):
            raise ValueError("invalid course id")
        self.api_client = APIClient()
        self.knowledge_graph = KnowledgeGraphAgent(api_client=self.api_client)
        self.teacher = TeacherAgent(api_client=self.api_client)
        self.evaluator = EvaluationAgent(api_client=self.api_client)
        self.course_id = course_id
        self.retriever: Optional[CourseRetriever] = None
        self.last_citations: List[Dict[str, Any]] = []
        self.last_knowledge_scope = "extension"

        # NOTE: 按 topic 隔离学习状态文件，每张星图独立存储
        state_file = str(self._state_file(topic))

        self.learner_state = LearnerState(state_file=state_file)
        logger.info(f"LearningService initialized (state_file={state_file})")

    @staticmethod
    def _legacy_safe_topic(topic: str) -> str:
        """Keep ordinary legacy names readable while neutralising path syntax."""
        value = re.sub(r"\s+", "_", topic.strip())
        value = re.sub(r"[^\w.-]+", "_", value, flags=re.UNICODE)
        while ".." in value:
            value = value.replace("..", "_")
        value = value.strip("._") or hashlib.sha256(topic.encode("utf-8")).hexdigest()[:16]
        if len(value) > 80:
            suffix = hashlib.sha256(topic.encode("utf-8")).hexdigest()[:12]
            value = f"{value[:64]}_{suffix}"
        return value

    def _scoped_topic(self, topic: str) -> str:
        if self.course_id:
            digest = hashlib.sha256(topic.encode("utf-8")).hexdigest()[:16]
            return f"{self.course_id}_{digest}"
        return self._legacy_safe_topic(topic)

    def _data_path(self, filename: str) -> Path:
        root = self.TEST_DATA_ROOT.resolve()
        root.mkdir(parents=True, exist_ok=True)
        path = (root / filename).resolve()
        try:
            path.relative_to(root)
        except ValueError as exc:
            raise ValueError("learning data path escapes test_data") from exc
        return path

    def _graph_file(self, topic: str) -> Path:
        return self._data_path(f"knowledge_graph_{self._scoped_topic(topic)}.json")

    def _state_file(self, topic: str) -> Path:
        if not topic and not self.course_id:
            return self._data_path("learner_state.json")
        return self._data_path(f"learner_state_{self._scoped_topic(topic)}.json")

    def load_graph(self, topic: str) -> Optional[Dict[str, Any]]:
        graph_file = self._graph_file(topic)
        if not graph_file.exists():
            return None
        try:
            value = json.loads(graph_file.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            return None
        return value if isinstance(value, dict) else None

    def _get_retriever(self) -> Optional[CourseRetriever]:
        if not self.course_id:
            return None
        if self.retriever is None:
            self.retriever = CourseRetriever(self.course_id, auto_build=False)
        return self.retriever

    def _course_evidence(self, query: str) -> tuple[str, List[Dict[str, Any]]]:
        retriever = self._get_retriever()
        if not retriever:
            self.last_citations = []
            self.last_knowledge_scope = "extension"
            return "", []
        results: List[RetrievalResult] = retriever.search(query, top_k=5)
        citations = citations_from_results(results)
        self.last_citations = citations
        self.last_knowledge_scope = "course" if citations else "extension"
        return build_course_context(results), citations

    def _decorate_course_result(
        self, result: Dict[str, Any], citations: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        result["citations"] = citations
        result["knowledge_scope"] = "course" if citations else "extension"
        return result

    def generate_knowledge_graph(
        self,
        topic: str,
        learning_goal: str = "",
        current_level: str = "零基础",
        target_level: str = "掌握核心概念",
        complexity: int = 2,
    ) -> Optional[Dict[str, Any]]:
        """Generates a knowledge graph."""
        try:
            course_context, _ = self._course_evidence(
                f"{topic} 课程目录 核心概念 前置知识 学习路径"
            )
            grounded_goal = learning_goal
            if course_context:
                grounded_goal = f"{learning_goal}\n\n{course_context}".strip()
            graph_data = self.knowledge_graph.generate_knowledge_graph(
                topic=topic,
                learning_goal=grounded_goal,
                current_level=current_level,
                target_level=target_level,
                complexity=complexity,
            )
            
            graph_file = self._graph_file(topic)
            with open(graph_file, "w", encoding="utf-8") as f:
                json.dump(graph_data, f, ensure_ascii=False, indent=2)
            
            return graph_data
        except CourseIndexNotReadyError:
            raise
        except Exception as e:
            logger.error(f"Failed to generate knowledge graph: {e}")
            return None

    def generate_project_graph(
        self,
        project_description: str,
        current_level: str = "零基础",
        complexity: int = 2,
    ) -> Optional[Dict[str, Any]]:
        """
        根据项目描述生成技能学习路径星图

        NOTE: 委托给 KnowledgeGraphAgent.generate_project_graph() 并持久化结果
        """
        try:
            graph_data = self.knowledge_graph.generate_project_graph(
                project_description=project_description,
                current_level=current_level,
                complexity=complexity,
            )

            graph_file = self._graph_file(project_description[:50])
            with open(graph_file, "w", encoding="utf-8") as f:
                json.dump(graph_data, f, ensure_ascii=False, indent=2)

            return graph_data
        except Exception as e:
            logger.error(f"Failed to generate project graph: {e}")
            return None

    def save_graph(self, topic: str, graph_data: Dict[str, Any]) -> bool:
        """
        将修改后的图谱数据写回磁盘 JSON 文件
        NOTE: 文件路径规则与 generate_knowledge_graph 保持一致
        """
        try:
            graph_file = self._graph_file(topic)
            with open(graph_file, "w", encoding="utf-8") as f:
                json.dump(graph_data, f, ensure_ascii=False, indent=2)
            logger.info(f"Graph saved to {graph_file}")
            return True
        except Exception as e:
            logger.error(f"Failed to save graph: {e}")
            return False

    def delete_graph(self, topic: str) -> None:
        """
        删除星图对应的图谱文件和学习状态文件

        Args:
            topic: 学习主题，用于定位需要删除的文件
        """
        files_to_delete = [
            self._graph_file(topic),
            self._state_file(topic),
        ]
        for file_path in files_to_delete:
            if file_path.exists():
                file_path.unlink()
                logger.info(f"已删除文件: {file_path}")
            else:
                logger.debug(f"文件不存在，跳过: {file_path}")

    def expand_graph(
        self,
        topic: str,
        existing_graph_data: Dict[str, Any],
        new_node_name: str,
        current_mastery: float = 0.0,
        target_mastery: float = 0.8,
        user_note: str = "",
    ) -> Dict[str, Any]:
        """
        在已有图谱基础上扩展新节点

        调用 AI 生成中间过渡节点和连接，合并到现有图谱后持久化。

        Args:
            topic: 学习主题（用于定位磁盘 JSON 文件）
            existing_graph_data: 当前完整图谱数据
            new_node_name: 用户要添加的目标节点名称
            current_mastery: 当前掌握度
            target_mastery: 期望掌握度
            user_note: 用户备注

        Returns:
            合并后的完整图谱数据

        Raises:
            Exception: AI 生成失败或数据合并异常时抛出
        """
        course_context, _ = self._course_evidence(
            f"{new_node_name} 前置知识 进阶路径"
        )
        # NOTE: 调用 KnowledgeGraphAgent 的 expand_graph 获取 AI 生成的扩展结果
        expand_result = self.knowledge_graph.expand_graph(
            existing_graph_data=existing_graph_data,
            new_node_name=new_node_name,
            current_mastery=current_mastery,
            target_mastery=target_mastery,
            user_note=user_note,
            course_context=course_context,
        )

        new_nodes = expand_result.get("new_nodes", [])
        new_links = expand_result.get("new_links", [])

        # NOTE: 去重校验——避免与已有节点 ID 冲突
        existing_node_ids = {n["id"] for n in existing_graph_data.get("nodes", [])}
        filtered_nodes = [n for n in new_nodes if n["id"] not in existing_node_ids]

        # NOTE: 合并新节点和连接到已有图谱
        merged_graph = {
            **existing_graph_data,
            "nodes": existing_graph_data.get("nodes", []) + filtered_nodes,
            "links": existing_graph_data.get("links", []) + new_links,
        }

        # NOTE: 为每个新增节点在 LearnerState 中注册知识点
        for node in filtered_nodes:
            attrs = node.get("attributes", {})
            self.learner_state.add_knowledge_point(
                name=node["name"],
                target_mastery=attrs.get("weight_B", 0.8),
                note=attrs.get("user_note", ""),
                initial_mastery=attrs.get("weight_A", 0.0),
            )

        # NOTE: 持久化合并后的完整图谱到磁盘
        self.save_graph(topic=topic, graph_data=merged_graph)

        logger.info(
            f"图谱扩展并持久化完成: 新增 {len(filtered_nodes)} 个节点、{len(new_links)} 条连接"
        )
        return merged_graph

    def get_knowledge_point(self, name: str) -> Optional[KnowledgePoint]:
        """Retrieves a knowledge point by name."""
        return self.learner_state.get_knowledge_point(name)

    def start_learning(
        self,
        node_name: str,
        node_description: str = "",
        user_note: str = "",
        target_mastery: float = 0.8,
        current_mastery: float = 0.0,
        graph_data: Optional[Dict[str, Any]] = None,
        project_description: str = "",
    ) -> KnowledgePoint:
        """Initializes or retrieves a knowledge point for learning."""
        combined_note = node_description
        if user_note:
            combined_note = f"{node_description}\n\n用户需求: {user_note}" if node_description else user_note

        kp = self.learner_state.add_knowledge_point(
            name=node_name,
            target_mastery=target_mastery,
            note=combined_note,
            initial_mastery=current_mastery,
        )
        
        # New flow: Return Teaching Plan instead of just the KP
        return self.generate_teaching_plan(kp, graph_data=graph_data,
                                           project_description=project_description)

    def update_knowledge_point(
        self,
        node_name: str,
        user_note: Optional[str] = None,
        target_mastery: Optional[float] = None,
        current_mastery: Optional[float] = None,
    ) -> Optional[KnowledgePoint]:
        """Updates an existing knowledge point."""
        kp = self.learner_state.get_knowledge_point(node_name)
        
        if not kp:
             return self.learner_state.add_knowledge_point(
                name=node_name,
                target_mastery=target_mastery if target_mastery is not None else 0.8,
                note=user_note if user_note is not None else "",
                initial_mastery=current_mastery if current_mastery is not None else 0.0,
            )
        
        # Update existing
        if target_mastery is not None:
            kp.target_mastery = target_mastery
        
        if user_note is not None:
            kp.note = user_note
            
        if current_mastery is not None:
            kp.actual_mastery = current_mastery
            
        self.learner_state._auto_save()
        return kp

    def generate_teaching_plan(
        self,
        knowledge_point: KnowledgePoint,
        graph_data: Optional[Dict[str, Any]] = None,
        project_description: str = "",
    ) -> str:
        """Generates a teaching plan for a knowledge point."""
        context = self.build_learner_context(knowledge_point.name, graph_data)
        course_context, _ = self._course_evidence(
            f"{knowledge_point.name} 教学目标 基本概念 实践"
        )
        if course_context:
            context = f"{context}\n\n{course_context}".strip()
        if context:
            logger.info(
                f"📋 为教学计划 '{knowledge_point.name}' 注入前置知识上下文:\n{context}"
            )
        # NOTE: 项目模式下注入项目上下文
        project_context = build_project_context_injection(project_description)
        if project_context:
            context = (context + "\n" + project_context) if context else project_context
        plan_obj = self.teacher.generate_teaching_plan(knowledge_point, context=context)

        # NOTE: 将结构化的教学计划持久化到 KnowledgePoint
        try:
            goal = plan_obj.goal
            steps = plan_obj.steps

            # 持久化计划到 KnowledgePoint，供后续 teach() 按步引用
            knowledge_point.teaching_plan = [
                {"name": s.name, "content": s.content, "verification": s.verification}
                for s in steps
            ]
            knowledge_point.current_step = 0
            knowledge_point.step_scores = []  # NOTE: 重置步骤分数
            knowledge_point.plan_generated_at = datetime.now().isoformat()
            knowledge_point.plan_version = uuid.uuid4().hex
            knowledge_point.last_teaching_content = ""
            knowledge_point.last_taught_step_index = None
            knowledge_point.last_teaching_completed_at = None
            knowledge_point.clear_quiz_context()
            self.learner_state._auto_save()

            # 渲染 Markdown 格式用于前端展示
            formatted_plan = f"### 📚 {knowledge_point.name} 教学计划\n\n"
            formatted_plan += f"**学习目标：** {goal}\n\n"

            for idx, step in enumerate(steps, 1):
                formatted_plan += f"**教学步骤{idx}：{step.name}。** "
                formatted_plan += f"内容：{step.content}。"
                formatted_plan += f" 验证方式：{step.verification}。\n\n"

            formatted_plan += "准备好了吗？点击下方按钮开始学习吧！"
            return formatted_plan
        except Exception as e:
            logger.error(f"Error formatting plan: {e}")
            return "Unable to generate plan. Let's start learning directly."

    def build_learner_context(
        self,
        node_name: str,
        graph_data: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        构建学习者上下文摘要，让 AI 了解学习者的全部前置知识掌握情况

        递归搜索当前节点的所有祖先节点（不只直接父层），
        并按掌握程度分类，指导 AI 聚焦当前知识点的教学。

        Args:
            node_name: 当前学习的知识点名称
            graph_data: 图谱数据（包含 nodes 和 links）

        Returns:
            学习者上下文字符串，为空时返回空字符串
        """
        if not graph_data:
            return ""

        nodes = graph_data.get("nodes", [])
        links = graph_data.get("links", [])

        # NOTE: 构建节点 ID 索引和反向邻接表（target → sources）
        current_node_id = None
        node_id_to_info: Dict[str, Dict] = {}
        # 反向图：记录每个节点的所有前置节点
        reverse_adj: Dict[str, list] = {}
        for node in nodes:
            node_id_to_info[node["id"]] = node
            reverse_adj.setdefault(node["id"], [])
            if node.get("name") == node_name:
                current_node_id = node["id"]

        for link in links:
            reverse_adj.setdefault(link["target"], []).append(link["source"])

        if not current_node_id:
            return ""

        # NOTE: BFS 搜索所有祖先节点（递归向上追溯）
        visited = set()
        queue = list(reverse_adj.get(current_node_id, []))
        ancestor_ids = []
        while queue:
            nid = queue.pop(0)
            if nid in visited:
                continue
            visited.add(nid)
            ancestor_ids.append(nid)
            # 继续向上追溯该节点的前置节点
            for parent_id in reverse_adj.get(nid, []):
                if parent_id not in visited:
                    queue.append(parent_id)

        if not ancestor_ids:
            return ""

        # NOTE: 将祖先节点按掌握程度分为两组
        mastered = []    # 已掌握（≥0.6），可以跳过
        weak = []        # 薄弱或未学习（<0.6），需要铺垫

        for ancestor_id in ancestor_ids:
            ancestor_node = node_id_to_info.get(ancestor_id)
            if not ancestor_node:
                continue

            ancestor_name = ancestor_node.get("name", "")
            kp = self.learner_state.get_knowledge_point(ancestor_name)
            if kp:
                mastery = kp.actual_mastery
            else:
                mastery = ancestor_node.get("attributes", {}).get("weight_A", 0.0)

            if mastery >= 0.6:
                mastered.append(f"- {ancestor_name} ({mastery:.0%})")
            else:
                weak.append(f"- {ancestor_name} ({mastery:.0%})")

        # NOTE: 构建上下文指令
        context_lines = ["【学习者知识背景】"]

        if mastered:
            context_lines.append("以下前置知识学习者已掌握，无需重复讲解，可直接引用：")
            context_lines.extend(mastered)

        if weak:
            context_lines.append("以下前置知识学习者尚未掌握或比较薄弱，讲解时需要简要铺垫：")
            context_lines.extend(weak)

        context_lines.append("")
        context_lines.append(
            "【重要】请只围绕当前知识点制定教学计划，"
            "不要涉及学习路线图中后续的知识点。"
        )

        return "\n".join(context_lines)

    def teach(self, knowledge_point: KnowledgePoint) -> Dict[str, Any]:
        """
        生成教学内容，按照教学计划的当前步骤进行讲解

        Returns:
            包含 content 和 sources 的字典
        """
        plan_step = knowledge_point.get_current_plan_step()
        step_query = plan_step.get("content", "") if plan_step else ""
        context, citations = self._course_evidence(
            f"{knowledge_point.name} {step_query}"
        )
        result = self.teacher.teach(
            knowledge_point,
            plan_step=plan_step,
            context=context,
        )
        knowledge_point.record_completed_teaching(result.get("content", ""))
        self.learner_state._auto_save()
        return self._decorate_course_result(result, citations)

    def reteach_step(
        self,
        knowledge_point: KnowledgePoint,
        error_analysis: str = "",
        project_description: str = "",
    ) -> Dict[str, Any]:
        """
        针对用户的错误，重新讲解当前步骤

        Args:
            knowledge_point: 知识点对象
            error_analysis: 评价中的错误分析（可选）
            project_description: 项目描述（项目模式下传入）

        Returns:
            包含 content 和 sources 的字典
        """
        plan_step = knowledge_point.get_current_plan_step()
        context, citations = self._course_evidence(
            f"{knowledge_point.name} {error_analysis} {plan_step or ''}"
        )
        result = self.teacher.reteach_from_errors(
            knowledge_point, plan_step=plan_step, error_analysis=error_analysis,
            project_context=build_project_context_injection(project_description),
            context=context,
        )
        knowledge_point.record_completed_teaching(result.get("content", ""))
        self.learner_state._auto_save()
        return self._decorate_course_result(result, citations)

    def advance_and_teach(self, knowledge_point: KnowledgePoint) -> Dict[str, Any]:
        """
        推进到下一个教学步骤并进行讲解

        Returns:
            包含 content、sources、current_step、total_steps、is_plan_completed 的字典
        """
        knowledge_point.advance_step()
        self.learner_state._auto_save()

        if knowledge_point.is_plan_completed():
            return {
                "content": "🎉 所有教学步骤已完成！恭喜你完成了本知识点的学习！",
                "sources": [],
                "current_step": knowledge_point.current_step,
                "total_steps": len(knowledge_point.teaching_plan),
                "is_plan_completed": True,
            }

        result = self.teach(knowledge_point)
        result["current_step"] = knowledge_point.current_step
        result["total_steps"] = len(knowledge_point.teaching_plan)
        result["is_plan_completed"] = False
        return result

    def discuss(
        self,
        knowledge_point: KnowledgePoint,
        teaching_content: str,
        question: str,
        image: Optional[str] = None,
        history: List[Dict[str, str]] = None,
        project_description: str = "",
    ) -> Dict[str, Any]:
        """
        处理用户讨论问题

        Returns:
            包含 content 和 sources 的字典
        """
        context, citations = self._course_evidence(f"{knowledge_point.name} {question}")
        result = self.teacher.discuss(
            knowledge_point=knowledge_point,
            teaching_content=context or teaching_content,
            question=question,
            image=image,
            discussion_history=history,
            project_context=build_project_context_injection(project_description),
        )
        return self._decorate_course_result(result, citations)

    def prepare_lesson_stream(
        self,
        knowledge_point: KnowledgePoint,
        project_description: str = "",
        error_analysis: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Prepare grounded prompts and metadata for a lesson SSE stream."""
        plan_step = knowledge_point.get_current_plan_step()
        query = f"{knowledge_point.name} {error_analysis or ''} {plan_step or ''}"
        context, citations = self._course_evidence(query)
        project_context = build_project_context_injection(project_description)
        if error_analysis is None:
            request = self.teacher.prepare_teach_prompt(
                knowledge_point,
                plan_step=plan_step,
                context=context,
                project_context=project_context,
            )
        else:
            request = self.teacher.prepare_reteach_prompt(
                knowledge_point,
                plan_step=plan_step,
                error_analysis=error_analysis,
                project_context=project_context,
                context=context,
            )
        request.update(
            {
                "citations": citations,
                "knowledge_scope": "course" if citations else "extension",
                "current_step": knowledge_point.current_step,
                "total_steps": len(knowledge_point.teaching_plan),
                "is_plan_completed": knowledge_point.is_plan_completed(),
            }
        )
        return request

    def prepare_discussion_stream(
        self,
        knowledge_point: KnowledgePoint,
        question: str,
        history: Optional[List[Dict[str, str]]] = None,
        project_description: str = "",
    ) -> Dict[str, Any]:
        """Prepare a grounded free-chat request for streaming."""
        context, citations = self._course_evidence(f"{knowledge_point.name} {question}")
        teaching_content = context or knowledge_point.last_teaching_content
        request = self.teacher.prepare_discuss_prompt(
            knowledge_point,
            teaching_content=teaching_content,
            question=question,
            discussion_history=history,
            project_context=build_project_context_injection(project_description),
        )
        request.update(
            {
                "citations": citations,
                "knowledge_scope": "course" if citations else "extension",
            }
        )
        return request

    def commit_streamed_teaching(
        self, knowledge_point: KnowledgePoint, completed_content: str
    ) -> None:
        """Persist lesson context only after the stream reached completion."""
        knowledge_point.record_completed_teaching(completed_content)
        self.learner_state._auto_save()

    def generate_question(self, knowledge_point: KnowledgePoint) -> Dict[str, str]:
        """Generate a quiz tied to the exact completed lesson step."""
        plan_step = knowledge_point.get_current_plan_step()
        if plan_step and (
            not knowledge_point.last_teaching_content
            or knowledge_point.last_taught_step_index != knowledge_point.current_step
        ):
            raise QuizContextError("请先完成当前步骤的讲解，再生成测验题。")
        context, _ = self._course_evidence(f"{knowledge_point.name} {plan_step or ''}")
        question = self.teacher.generate_question(
            knowledge_point,
            plan_step=plan_step,
            last_teaching_content=knowledge_point.last_teaching_content,
            context=context,
        )
        question_id = uuid.uuid4().hex
        knowledge_point.active_question_id = question_id
        knowledge_point.active_question_text = question
        knowledge_point.active_question_step_index = knowledge_point.current_step
        knowledge_point.active_question_plan_version = knowledge_point.plan_version
        self.learner_state._auto_save()
        return {"question": question, "question_id": question_id}

    def evaluate_answer(
        self,
        knowledge_point: KnowledgePoint,
        question: str,
        answer: str,
        question_id: Optional[str] = None,
    ) -> Any:
        """
        评估用户回答并更新掌握度

        双层评分机制：
        - 有教学计划时：记录步骤分 → 加权计算全局掌握度
        - 无教学计划时：沿用原有 EMA 评分
        """
        if question_id:
            if question_id != knowledge_point.active_question_id:
                raise QuizContextError("这道题已失效，请为当前步骤重新生成题目。")
            if (
                knowledge_point.active_question_step_index != knowledge_point.current_step
                or knowledge_point.active_question_plan_version != knowledge_point.plan_version
                or question != knowledge_point.active_question_text
            ):
                raise QuizContextError("题目与当前教学步骤不匹配，请重新生成。")

        context, _ = self._course_evidence(
            f"{knowledge_point.name} {knowledge_point.get_current_plan_step() or ''} {question}"
        )
        evaluation = self.evaluator.evaluate(
            knowledge_point=knowledge_point,
            question=question,
            answer=answer,
            context=context,
        )

        if knowledge_point.teaching_plan:
            # NOTE: 双层评分 —— 记录步骤分并加权聚合
            step_idx = knowledge_point.current_step
            knowledge_point.record_step_score(step_idx, evaluation.score)

            # 用加权公式重新计算全局掌握度
            new_mastery = knowledge_point.calculate_weighted_mastery()
            knowledge_point.update_mastery(new_mastery, evaluation.score, evaluation.feedback)
            self.learner_state._auto_save()

            logger.info(
                f"双层评分: 步骤 {step_idx + 1} 得分={evaluation.score:.2f}, "
                f"全局掌握度={new_mastery:.2f}"
            )
        else:
            # NOTE: 无教学计划时，沿用原有 EMA 评分公式
            self.evaluator.update_learner_state(
                learner_state=self.learner_state,
                knowledge_point_name=knowledge_point.name,
                evaluation_result=evaluation,
            )

        knowledge_point.clear_quiz_context()
        self.learner_state._auto_save()
        return evaluation

    def get_progress_feedback(self, evaluation_result: Any, knowledge_point: KnowledgePoint) -> str:
        """Generates feedback string based on evaluation."""
        return self.evaluator.get_progress_feedback(evaluation_result, knowledge_point)

    def explain_answer(
        self,
        knowledge_point: KnowledgePoint,
        question: str,
        user_answer: str,
        correct_analysis: str
    ) -> str:
        """Explains the correct answer."""
        return self.teacher.explain_answer(
            knowledge_point=knowledge_point,
            question=question,
            user_answer=user_answer,
            correct_analysis=correct_analysis
        )

    def get_learner_state_summary(self) -> Dict[str, Any]:
        """Returns the summary of learner's progress."""
        return self.learner_state.get_progress_summary()
