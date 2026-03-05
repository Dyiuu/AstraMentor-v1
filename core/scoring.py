"""
评分算法模块

实现增强版动态评分算法，基于带权重指数移动平均（Weighted EMA）
并融合BKT和IRT的优秀特性

增强特性：
1. 自适应学习率：根据教学阶段动态调整
2. 时间遗忘因子：长时间不练习会导致掌握度衰减
3. 失误容错：高掌握度答错时减少惩罚
4. 猜对检测：低掌握度答对时减少奖励
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional

from config import get_config


class TaskDifficulty(Enum):
    """
    任务难度枚举
    
    不同难度的任务对应不同的掌握度上限（W_cap）
    """
    
    # 选择题/概念问答：最多只能评到0.4
    CONCEPT = "concept"
    
    # 基础代码填空：最多只能评到0.7
    BASIC_CODE = "basic_code"
    
    # 复杂项目/手写算法：可以评到1.0
    ADVANCED = "advanced"


@dataclass
class ScoringResult:
    """评分结果数据类"""
    
    # 任务评分（0.0-1.0）
    task_score: float
    
    # 更新前的掌握度
    old_mastery: float
    
    # 更新后的掌握度
    new_mastery: float
    
    # 任务难度
    difficulty: TaskDifficulty
    
    # 难度上限
    difficulty_cap: float
    
    # 学习率
    learning_rate: float
    
    # 时间衰减因子（增强版新增）
    time_decay: float = 1.0
    
    # 容错因子（增强版新增）
    tolerance_factor: float = 1.0
    
    # 算法类型标识
    algorithm: str = "enhanced_ema"
    
    def get_improvement(self) -> float:
        """获取掌握度提升量"""
        return self.new_mastery - self.old_mastery


class ScoringEngine:
    """
    增强版评分引擎
    
    核心公式：
    A_new = A_old + α(stage) × (S_task × W_cap - A_old) × β(time) × γ(tolerance)
    
    其中：
    - A_new: 更新后的掌握度
    - A_old: 更新前的掌握度
    - α(stage): 自适应学习率，根据阶段调整
    - S_task: AI对用户本次回答/代码的评分（0.0-1.0）
    - W_cap: 任务难度上限
    - β(time): 时间遗忘因子
    - γ(tolerance): 失误/猜对容错因子
    """
    
    def __init__(self, learning_rate: Optional[float] = None):
        """
        初始化评分引擎
        
        Args:
            learning_rate: 基础学习率，为None时使用配置默认值
        """
        config = get_config()
        self.base_learning_rate = learning_rate or config.learning.learning_rate
        self.config = config.learning
        
        # 增强版参数配置
        self.stage_learning_rates = {
            0: 0.40,  # 启蒙阶段：学习快，容易进步
            1: 0.35,  # 基础阶段：稍慢一些
            2: 0.25,  # 进阶阶段：需要更多练习
        3: 0.18,  # 熟练阶段：精益求精
        4: 0.12,  # 专家阶段：变化微小
        }
        
        # 时间遗忘配置
        self.forgetting_start_days = 7   # 7天后开始遗忘
        self.forgetting_rate = 0.02      # 每天遗忘2%
        self.forgetting_floor = 0.1      # 遗忘下限，不会低于10%
        
        # 容错配置
        self.slip_threshold = 0.7        # 高于此掌握度视为"会"
        self.guess_threshold = 0.3       # 低于此掌握度视为"不会"
        self.slip_protection = 0.5       # 失误保护：惩罚减半
        self.guess_dampening = 0.6       # 猜对抑制：奖励打折
    
    def get_difficulty_cap(self, difficulty: TaskDifficulty) -> float:
        """
        获取任务难度对应的掌握度上限
        
        Args:
            difficulty: 任务难度
            
        Returns:
            掌握度上限值（W_cap）
        """
        caps = {
            TaskDifficulty.CONCEPT: self.config.difficulty_concept,
            TaskDifficulty.BASIC_CODE: self.config.difficulty_basic_code,
            TaskDifficulty.ADVANCED: self.config.difficulty_advanced,
        }
        return caps.get(difficulty, self.config.difficulty_basic_code)
    
    def get_adaptive_learning_rate(self, mastery: float) -> float:
        """
        获取自适应学习率
        
        根据当前掌握度所处阶段返回对应的学习率
        初期学习快，后期精进慢
        
        Args:
            mastery: 当前掌握度
            
        Returns:
            对应阶段的学习率
        """
        if mastery < 0.2:
            stage = 0
        elif mastery < 0.45:
            stage = 1
        elif mastery < 0.7:
            stage = 2
        elif mastery < 0.9:
            stage = 3
        else:
            stage = 4
        
        return self.stage_learning_rates.get(stage, self.base_learning_rate)
    
    def calculate_time_decay(
        self,
        last_practice_time: Optional[datetime] = None
    ) -> float:
        """
        计算时间遗忘因子
        
        长时间不练习会导致掌握度衰减
        公式：β = max(floor, 1 - rate × max(0, days - start_days))
        
        Args:
            last_practice_time: 上次练习时间
            
        Returns:
            时间衰减因子（0.0-1.0），1.0表示无衰减
        """
        if last_practice_time is None:
            return 1.0
        
        days_since_practice = (datetime.now() - last_practice_time).days
        
        if days_since_practice <= self.forgetting_start_days:
            return 1.0
        
        # 计算衰减
        extra_days = days_since_practice - self.forgetting_start_days
        decay = 1.0 - self.forgetting_rate * extra_days
        
        # 不低于遗忘下限
        return max(self.forgetting_floor, decay)
    
    def calculate_tolerance_factor(
        self,
        old_mastery: float,
        task_score: float
    ) -> float:
        """
        计算容错因子
        
        融合BKT的失误(slip)和猜对(guess)概念：
        - 高掌握度答错：可能是失误，减少惩罚
        - 低掌握度答对：可能是猜对，减少奖励
        
        Args:
            old_mastery: 当前掌握度
            task_score: 本次评分
            
        Returns:
            容错因子
        """
        # 计算变化方向
        is_improvement = task_score > old_mastery
        
        # 高掌握度答错（失误保护）
        if old_mastery >= self.slip_threshold and task_score < 0.5:
            # 答错了，但可能是失误，减少惩罚
            return self.slip_protection
        
        # 低掌握度答对（猜对抑制）
        if old_mastery <= self.guess_threshold and task_score > 0.8:
            # 答对了，但可能是猜的，减少奖励
            return self.guess_dampening
        
        return 1.0
    
    def calculate_new_mastery(
        self,
        old_mastery: float,
        task_score: float,
        difficulty: TaskDifficulty,
        last_practice_time: Optional[datetime] = None,
        use_enhanced: bool = True
    ) -> ScoringResult:
        """
        计算更新后的掌握度（增强版）
        
        增强公式：
        A_new = A_old × β + α × (S × W_cap - A_old × β) × γ
        
        Args:
            old_mastery: 当前掌握度（A_old）
            task_score: 任务评分（S_task，0.0-1.0）
            difficulty: 任务难度
            last_practice_time: 上次练习时间（用于遗忘计算）
            use_enhanced: 是否使用增强算法
            
        Returns:
            ScoringResult包含完整的评分结果
        """
        # 验证输入范围
        old_mastery = max(0.0, min(1.0, old_mastery))
        task_score = max(0.0, min(1.0, task_score))
        
        # 获取难度上限
        w_cap = self.get_difficulty_cap(difficulty)
        
        if use_enhanced:
            # 增强版算法
            
            # 1. 计算时间衰减后的掌握度
            time_decay = self.calculate_time_decay(last_practice_time)
            decayed_mastery = old_mastery * time_decay
            
            # 2. 获取自适应学习率
            learning_rate = self.get_adaptive_learning_rate(decayed_mastery)
            
            # 3. 计算容错因子
            tolerance_factor = self.calculate_tolerance_factor(
                old_mastery, task_score
            )
            
            # 4. 计算目标掌握度
            # 修复：如果用户当前的掌握度已经超过了任务难度上限，且本次答题表现良好（>=0.8）
            # 则进入"维护模式"，目标是不让掌握度因为做简单题而下降
            if old_mastery > w_cap and task_score >= 0.8:
                target = max(task_score * w_cap, old_mastery)
            else:
                target = task_score * w_cap
            
            # 5. 计算基础变化量
            delta = target - decayed_mastery
            
            # 6. 应用增强公式
            # 如果是下降（delta < 0），应用容错保护
            # 如果是上升（delta > 0），检查是否需要抑制猜对
            if delta < 0:
                # 下降时应用失误保护
                adjusted_delta = delta * tolerance_factor
            else:
                # 上升时检查猜对抑制
                adjusted_delta = delta * tolerance_factor
            
            new_mastery = decayed_mastery + learning_rate * adjusted_delta
            
        else:
            # 原版算法（向后兼容）
            learning_rate = self.base_learning_rate
            time_decay = 1.0
            tolerance_factor = 1.0
            target = task_score * w_cap
            new_mastery = old_mastery + learning_rate * (target - old_mastery)
        
        # 确保结果在有效范围内
        new_mastery = max(0.0, min(1.0, new_mastery))
        
        return ScoringResult(
            task_score=task_score,
            old_mastery=old_mastery,
            new_mastery=round(new_mastery, 4),
            difficulty=difficulty,
            difficulty_cap=w_cap,
            learning_rate=learning_rate,
            time_decay=time_decay,
            tolerance_factor=tolerance_factor,
            algorithm="enhanced_ema" if use_enhanced else "basic_ema"
        )
    
    def apply_forgetting(
        self,
        current_mastery: float,
        last_practice_time: datetime
    ) -> float:
        """
        单独应用遗忘衰减（不涉及答题）
        
        用于在显示学习状态时实时计算衰减后的掌握度
        
        Args:
            current_mastery: 记录的掌握度
            last_practice_time: 上次练习时间
            
        Returns:
            衰减后的掌握度
        """
        decay = self.calculate_time_decay(last_practice_time)
        return round(current_mastery * decay, 4)
    
    def determine_difficulty(self, question_type: str) -> TaskDifficulty:
        """
        根据问题类型判断难度
        
        Args:
            question_type: 问题类型描述
            
        Returns:
            对应的TaskDifficulty
        """
        question_lower = question_type.lower()
        
        # 高级难度关键词
        advanced_keywords = [
            "实现", "编写", "设计", "优化", "架构",
            "算法", "项目", "系统", "完整", "手写",
            "implement", "write", "design", "optimize", "architecture",
            "algorithm", "project", "system", "complete"
        ]
        
        # 基础代码关键词
        basic_keywords = [
            "填空", "补全", "修改", "调试", "修复",
            "fill", "complete", "modify", "debug", "fix",
            "代码", "code", "函数", "function"
        ]
        
        # 按优先级匹配
        for keyword in advanced_keywords:
            if keyword in question_lower:
                return TaskDifficulty.ADVANCED
        
        for keyword in basic_keywords:
            if keyword in question_lower:
                return TaskDifficulty.BASIC_CODE
        
        return TaskDifficulty.CONCEPT
    
    def format_score_feedback(self, score: float) -> str:
        """
        根据评分生成简短的等级描述
        
        Args:
            score: 评分（0.0-1.0）
            
        Returns:
            评分等级描述
        """
        if score < 0.2:
            return "🌱 还需努力"
        elif score < 0.4:
            return "💡 有所领悟"
        elif score < 0.6:
            return "📖 基本掌握"
        elif score < 0.8:
            return "💪 表现不错"
        else:
            return "🌟 非常出色"
    
    def get_algorithm_explanation(self, result: ScoringResult) -> str:
        """
        生成算法解释（用于调试和透明度）
        
        Args:
            result: 评分结果
            
        Returns:
            人类可读的算法解释
        """
        lines = [
            f"📊 评分算法详情 ({result.algorithm})",
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            f"本次得分: {result.task_score:.2f}",
            f"难度上限: {result.difficulty_cap:.1f} ({result.difficulty.value})",
            f"学习率α: {result.learning_rate:.2f}",
        ]
        
        if result.time_decay < 1.0:
            lines.append(f"时间衰减β: {result.time_decay:.2f} (长时间未练习)")
        
        if result.tolerance_factor != 1.0:
            if result.tolerance_factor == 0.5:
                lines.append(f"容错因子γ: {result.tolerance_factor:.2f} (失误保护)")
            else:
                lines.append(f"容错因子γ: {result.tolerance_factor:.2f} (猜对抑制)")
        
        improvement = result.get_improvement()
        if improvement >= 0:
            lines.append(f"掌握度变化: {result.old_mastery:.2%} → {result.new_mastery:.2%} (+{improvement:.2%})")
        else:
            lines.append(f"掌握度变化: {result.old_mastery:.2%} → {result.new_mastery:.2%} ({improvement:.2%})")
        
        return "\n".join(lines)
