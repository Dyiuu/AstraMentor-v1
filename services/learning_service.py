import logging
import json
from pathlib import Path
from typing import Optional, Dict, List, Any
from datetime import datetime

from agents.teacher_agent import TeacherAgent
from agents.evaluation_agent import EvaluationAgent
from agents.knowledge_graph_agent import KnowledgeGraphAgent
from core.learner_state import LearnerState, KnowledgePoint
from core.constants import LearningLevel
from utils.api_client import APIClient

logger = logging.getLogger(__name__)

class LearningService:
    """
    Core service for AstraMentor learning logic.
    Decoupled from CLI/Web interfaces.
    """

    def __init__(self, state_file: str = "learner_state.json"):
        self.api_client = APIClient()
        self.knowledge_graph = KnowledgeGraphAgent(api_client=self.api_client)
        self.teacher = TeacherAgent(api_client=self.api_client)
        self.evaluator = EvaluationAgent(api_client=self.api_client)
        self.learner_state = LearnerState(state_file=state_file)
        logger.info("LearningService initialized")

    def generate_knowledge_graph(
        self,
        topic: str,
        learning_goal: str = "",
        current_level: str = "零基础",
        target_level: str = "掌握核心概念",
    ) -> Optional[Dict[str, Any]]:
        """Generates a knowledge graph."""
        try:
            graph_data = self.knowledge_graph.generate_knowledge_graph(
                topic=topic,
                learning_goal=learning_goal,
                current_level=current_level,
                target_level=target_level,
            )
            
            # Save to file (legacy behavior, but useful)
            test_data_dir = Path("test_data")
            test_data_dir.mkdir(exist_ok=True)
            graph_filename = f"knowledge_graph_{topic.replace(' ', '_').replace('/', '_')}.json"
            graph_file = test_data_dir / graph_filename
            with open(graph_file, "w", encoding="utf-8") as f:
                json.dump(graph_data, f, ensure_ascii=False, indent=2)
            
            return graph_data
        except Exception as e:
            logger.error(f"Failed to generate knowledge graph: {e}")
            return None

    def save_graph(self, topic: str, graph_data: Dict[str, Any]) -> bool:
        """
        将修改后的图谱数据写回磁盘 JSON 文件
        NOTE: 文件路径规则与 generate_knowledge_graph 保持一致
        """
        try:
            test_data_dir = Path("test_data")
            test_data_dir.mkdir(exist_ok=True)
            graph_filename = f"knowledge_graph_{topic.replace(' ', '_').replace('/', '_')}.json"
            graph_file = test_data_dir / graph_filename
            with open(graph_file, "w", encoding="utf-8") as f:
                json.dump(graph_data, f, ensure_ascii=False, indent=2)
            logger.info(f"Graph saved to {graph_file}")
            return True
        except Exception as e:
            logger.error(f"Failed to save graph: {e}")
            return False

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
        # NOTE: 调用 KnowledgeGraphAgent 的 expand_graph 获取 AI 生成的扩展结果
        expand_result = self.knowledge_graph.expand_graph(
            existing_graph_data=existing_graph_data,
            new_node_name=new_node_name,
            current_mastery=current_mastery,
            target_mastery=target_mastery,
            user_note=user_note,
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
        return self.generate_teaching_plan(kp)

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

    def generate_teaching_plan(self, knowledge_point: KnowledgePoint) -> str:
        """Generates a teaching plan for a knowledge point."""
        plan_json = self.teacher.generate_teaching_plan(knowledge_point)
        # plan_json is a Dict because teacher agent parses it with Pydantic
        # format it to a nice string
        try:
             # It might be a dict or an object depending on how APIClient returns pydantic models
             # TeacherAgent.generate_teaching_plan returns a Pydantic model instance or dict?
             # Let's check TeacherAgent. It returns 'plan' which comes from api_client.generate_json
             # api_client.generate_json returns the parsed object (planSchema instance)
             
             steps = plan_json.todo
             formatted_plan = f"### 📚 {knowledge_point.name} 教学计划\n\n为了帮你更好地掌握这个知识点，我为你准备了以下学习步骤：\n\n"
             for idx, step in enumerate(steps, 1):
                 formatted_plan += f"{idx}. {step}\n"
             
             formatted_plan += "\n准备好了吗？点击下方按钮开始学习吧！"
             return formatted_plan
        except Exception as e:
            logger.error(f"Error formatting plan: {e}")
            return "Unable to generate plan. Let's start learning directly."

    def teach(self, knowledge_point: KnowledgePoint) -> str:
        """Generates teaching content."""
        return self.teacher.teach(knowledge_point)

    def discuss(
        self,
        knowledge_point: KnowledgePoint,
        teaching_content: str,
        question: str,
        image: Optional[str] = None,
        history: List[Dict[str, str]] = None
    ) -> str:
        """Handles user questions during discussion."""
        return self.teacher.discuss(
            knowledge_point=knowledge_point,
            teaching_content=teaching_content,
            question=question,
            image=image,
            discussion_history=history
        )

    def generate_question(self, knowledge_point: KnowledgePoint) -> str:
        """Generates a quiz question."""
        return self.teacher.generate_question(knowledge_point)

    def evaluate_answer(
        self,
        knowledge_point: KnowledgePoint,
        question: str,
        answer: str
    ) -> Any: # Returns EvaluationResult (pydantic model or object)
        """Evaluates the user's answer and updates state."""
        evaluation = self.evaluator.evaluate(
            knowledge_point=knowledge_point,
            question=question,
            answer=answer
        )
        
        self.evaluator.update_learner_state(
            learner_state=self.learner_state,
            knowledge_point_name=knowledge_point.name,
            evaluation_result=evaluation,
        )
        
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
