"""
学习者状态管理模块

管理用户对各知识点的掌握程度和学习历史
"""

import json
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional


@dataclass
class KnowledgePoint:
    """知识点数据类"""
    
    # 知识点名称
    name: str
    
    # A权重：用户实际的学习程度（0.0-1.0）
    actual_mastery: float = 0.0
    
    # B权重：用户期望的掌握程度（0.0-1.0）
    target_mastery: float = 0.8
    
    # 用户备注
    note: str = ""
    
    # 学习历史记录
    history: list = field(default_factory=list)
    
    # 创建时间
    created_at: str = field(
        default_factory=lambda: datetime.now().isoformat()
    )
    
    # 最后更新时间
    updated_at: str = field(
        default_factory=lambda: datetime.now().isoformat()
    )

    # NOTE: 教学计划相关字段 —— 支持按计划逐步教学
    # 每个元素为 {"name": str, "content": str, "verification": str}
    teaching_plan: list = field(default_factory=list)

    # 当前正在进行的步骤索引（从 0 开始）
    current_step: int = 0

    # 教学计划生成时间（用于判断是否需要重新生成）
    plan_generated_at: Optional[str] = None

    # NOTE: 双层评分 —— 每步测验分独立记录，支持重考覆盖
    # step_scores[i] 对应 teaching_plan[i] 的最新测验分 (0.0-1.0)
    step_scores: list = field(default_factory=list)

    # The following fields bind a quiz to the exact lesson step that produced it.
    # They are persisted with learner state so a page refresh cannot silently
    # switch the quiz to a different step.
    plan_version: str = ""
    last_teaching_content: str = ""
    last_taught_step_index: Optional[int] = None
    last_teaching_completed_at: Optional[str] = None
    active_question_id: Optional[str] = None
    active_question_text: str = ""
    active_question_step_index: Optional[int] = None
    active_question_plan_version: str = ""

    def clear_quiz_context(self) -> None:
        """Invalidate any quiz created for a previous lesson or plan."""
        self.active_question_id = None
        self.active_question_text = ""
        self.active_question_step_index = None
        self.active_question_plan_version = ""

    def record_completed_teaching(self, content: str) -> None:
        """Remember only a fully completed lesson as the quiz source."""
        self.last_teaching_content = content.strip()
        self.last_taught_step_index = self.current_step
        self.last_teaching_completed_at = datetime.now().isoformat()
        self.clear_quiz_context()
        self.updated_at = datetime.now().isoformat()

    def record_step_score(self, step_index: int, score: float) -> None:
        """
        记录某步骤的测验分数（重考时覆盖旧分）

        Args:
            step_index: 步骤索引
            score: AI 评分 (0.0-1.0)
        """
        # 自动扩展列表长度
        while len(self.step_scores) <= step_index:
            self.step_scores.append(0.0)
        self.step_scores[step_index] = score

    def calculate_weighted_mastery(self) -> float:
        """
        根据所有已完成步骤的分数，计算加权全局掌握度

        公式：weighted_avg × completion_factor × target_mastery
        - 权重递增：weights[i] = 1.0 + i * 0.5（后面步骤更重要）
        - 完成度系数 = completed_steps / total_steps

        Returns:
            加权后的全局掌握度 (0.0 - target_mastery)
        """
        if not self.step_scores or not self.teaching_plan:
            return self.actual_mastery

        completed = len(self.step_scores)
        total = len(self.teaching_plan)

        # NOTE: 步骤权重递增：[1.0, 1.5, 2.0, 2.5, ...]
        weights = [1.0 + i * 0.5 for i in range(completed)]
        weighted_sum = sum(s * w for s, w in zip(self.step_scores, weights))
        weight_total = sum(weights)

        weighted_avg = weighted_sum / weight_total if weight_total > 0 else 0.0

        # NOTE: 完成度系数——未完成全部步骤会压低掌握度
        completion_factor = completed / total

        return min(
            weighted_avg * completion_factor * self.target_mastery,
            self.target_mastery
        )

    def get_current_plan_step(self) -> Optional[dict]:
        """
        获取当前教学步骤

        Returns:
            当前步骤的 dict，如果所有步骤已完成则返回 None
        """
        if not self.teaching_plan or self.current_step >= len(self.teaching_plan):
            return None
        return self.teaching_plan[self.current_step]

    def advance_step(self) -> None:
        """推进到下一个教学步骤"""
        self.current_step += 1
        self.clear_quiz_context()
        self.updated_at = datetime.now().isoformat()

    def is_plan_completed(self) -> bool:
        """判断是否已完成教学计划的所有步骤"""
        if not self.teaching_plan:
            return True
        return self.current_step >= len(self.teaching_plan)

    def update_mastery(self, new_mastery: float, score: float, feedback: str) -> None:
        """
        更新掌握度并记录历史
        
        Args:
            new_mastery: 新的掌握度值
            score: 本次评分
            feedback: 反馈内容
        """
        self.history.append({
            "timestamp": datetime.now().isoformat(),
            "old_mastery": self.actual_mastery,
            "new_mastery": new_mastery,
            "score": score,
            "feedback": feedback
        })
        self.actual_mastery = new_mastery
        self.updated_at = datetime.now().isoformat()
    
    def is_mastered(self) -> bool:
        """检查是否已达到期望掌握度"""
        return self.actual_mastery >= self.target_mastery
    
    def get_teaching_stage(self) -> int:
        """
        根据当前掌握度获取教学阶段（5 档）

        Returns:
            0: 启蒙阶段 (0.0 <= A < 0.2)
            1: 基础阶段 (0.2 <= A < 0.45)
            2: 进阶阶段 (0.45 <= A < 0.7)
            3: 熟练阶段 (0.7 <= A < 0.9)
            4: 专家阶段 (0.9 <= A <= 1.0)
        """
        a = self.actual_mastery
        if a < 0.2:
            return 0
        elif a < 0.45:
            return 1
        elif a < 0.7:
            return 2
        elif a < 0.9:
            return 3
        else:
            return 4
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return asdict(self)
    
    def get_last_practice_time(self) -> Optional[datetime]:
        """
        获取上次练习时间
        
        用于计算时间遗忘因子
        
        Returns:
            上次练习的datetime对象，无练习记录返回None
        """
        if not self.history:
            return None
        
        last_entry = self.history[-1]
        try:
            return datetime.fromisoformat(last_entry["timestamp"])
        except (KeyError, ValueError):
            return None
    
    @classmethod
    def from_dict(cls, data: dict) -> "KnowledgePoint":
        """从字典创建实例"""
        return cls(**data)


class LearnerState:
    """
    学习者状态管理类
    
    管理用户的所有知识点学习状态，支持持久化存储
    """
    
    def __init__(self, state_file: Optional[str] = None):
        """
        初始化学习者状态
        
        Args:
            state_file: 状态文件路径，用于持久化存储
        """
        self.knowledge_points: dict[str, KnowledgePoint] = {}
        self.state_file = Path(state_file) if state_file else None
        
        # 如果状态文件存在，加载历史状态
        if self.state_file and self.state_file.exists():
            self.load()
    
    def add_knowledge_point(
        self,
        name: str,
        target_mastery: float = 0.8,
        note: str = "",
        initial_mastery: float = 0.0
    ) -> KnowledgePoint:
        """
        添加或获取知识点
        
        Args:
            name: 知识点名称
            target_mastery: 期望掌握度（B权重）
            note: 用户备注
            initial_mastery: 初始掌握度（A权重）
            
        Returns:
            KnowledgePoint实例
        """
        if name not in self.knowledge_points:
            self.knowledge_points[name] = KnowledgePoint(
                name=name,
                actual_mastery=initial_mastery,
                target_mastery=target_mastery,
                note=note
            )
        else:
            # 更新现有知识点的期望掌握度和备注
            kp = self.knowledge_points[name]
            kp.target_mastery = target_mastery
            if note:
                kp.note = note
        
        self._auto_save()
        return self.knowledge_points[name]
    
    def get_knowledge_point(self, name: str) -> Optional[KnowledgePoint]:
        """获取知识点"""
        return self.knowledge_points.get(name)
    
    def update_mastery(
        self,
        name: str,
        new_mastery: float,
        score: float,
        feedback: str
    ) -> bool:
        """
        更新知识点掌握度
        
        Args:
            name: 知识点名称
            new_mastery: 新的掌握度
            score: 本次评分
            feedback: 反馈内容
            
        Returns:
            是否更新成功
        """
        kp = self.knowledge_points.get(name)
        if kp is None:
            return False
        
        kp.update_mastery(new_mastery, score, feedback)
        self._auto_save()
        return True
    
    def list_knowledge_points(self) -> list[KnowledgePoint]:
        """列出所有知识点"""
        return list(self.knowledge_points.values())
    
    def get_progress_summary(self) -> dict:
        """
        获取学习进度摘要
        
        Returns:
            包含总数、已掌握数、平均掌握度的字典
        """
        total = len(self.knowledge_points)
        if total == 0:
            return {
                "total": 0,
                "mastered": 0,
                "average_mastery": 0.0
            }
        
        mastered = sum(
            1 for kp in self.knowledge_points.values()
            if kp.is_mastered()
        )
        avg_mastery = sum(
            kp.actual_mastery for kp in self.knowledge_points.values()
        ) / total
        
        return {
            "total": total,
            "mastered": mastered,
            "average_mastery": round(avg_mastery, 3)
        }
    
    def save(self) -> None:
        """保存状态到文件"""
        if self.state_file is None:
            return
        
        data = {
            name: kp.to_dict()
            for name, kp in self.knowledge_points.items()
        }
        
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.state_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    def load(self) -> None:
        """从文件加载状态"""
        if self.state_file is None or not self.state_file.exists():
            return
        
        with open(self.state_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        self.knowledge_points = {
            name: KnowledgePoint.from_dict(kp_data)
            for name, kp_data in data.items()
        }
    
    def _auto_save(self) -> None:
        """自动保存（如果配置了状态文件）"""
        if self.state_file:
            self.save()
