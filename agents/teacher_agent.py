"""
Teacher Agent 模块

负责教学功能，包括生成教学计划、按计划教学和提问验证
"""

import logging
from typing import Optional, Dict, Any, List, Union

from pydantic import BaseModel

from core.learner_state import KnowledgePoint
from core.prompts import (
    get_teaching_prompt,
    get_teaching_plan_prompt,
    get_question_prompt
)
from utils.api_client import APIClient
from config import get_config


logger = logging.getLogger(__name__)


class TeacherAgent:
    """
    教学Agent
    
    负责：
    1. 根据知识点和用户状态生成教学计划
    2. 按计划逐步教学
    3. 每次讲解后生成验证问题
    """
    
    def __init__(self, api_client: Optional[APIClient] = None):
        """
        初始化Teacher Agent
        
        Args:
            api_client: API客户端，为None时自动创建
        """
        self.api_client = api_client or APIClient()
        logger.info("Teacher Agent 初始化完成")

    def prepare_teach_prompt(
        self,
        knowledge_point: KnowledgePoint,
        plan_step: Optional[Dict[str, str]] = None,
        context: str = "",
        project_context: str = "",
    ) -> Dict[str, Any]:
        """Build a lesson request that can be used by streaming transports."""
        system_instruction = get_teaching_prompt(
            stage=knowledge_point.get_teaching_stage(),
            topic=knowledge_point.name,
            current_score=knowledge_point.actual_mastery,
        )
        if project_context:
            system_instruction += f"\n\n{project_context}"
        prompt = f"请讲解知识点：{knowledge_point.name}"
        if knowledge_point.note:
            prompt += f"\n\n用户备注：{knowledge_point.note}"
        if context:
            prompt += f"\n\n补充说明：{context}"
        if "【课程教材证据】" in context:
            system_instruction += (
                "\n\n【课程边界】优先依据给定教材证据讲解。"
                "教材之外的内容必须明确标注为“扩展知识”。"
            )
        if plan_step:
            prompt += f"""

【当前教学步骤】
步骤名称：{plan_step.get('name', '')}
教学内容要求：{plan_step.get('content', '')}

请严格按照上述步骤要求进行讲解，只讲本步骤的内容，不要超前。
【重要】不要在讲解中包含任何练习题、填空题、改错题或测验，出题由专门的评估模块处理。"""
        return {
            "prompt": prompt,
            "system_instruction": system_instruction,
            "temperature": 0.4,
            "max_tokens": 2500,
        }

    def prepare_reteach_prompt(
        self,
        knowledge_point: KnowledgePoint,
        plan_step: Optional[Dict[str, str]] = None,
        error_analysis: str = "",
        project_context: str = "",
        context: str = "",
    ) -> Dict[str, Any]:
        """Build a remediation request for the current lesson step."""
        system_instruction = get_teaching_prompt(
            stage=knowledge_point.get_teaching_stage(),
            topic=knowledge_point.name,
            current_score=knowledge_point.actual_mastery,
        )
        if project_context:
            system_instruction += f"\n\n{project_context}"
        prompt = f"请针对学习者在以下知识点上的薄弱环节重新讲解：\n\n【知识点】{knowledge_point.name}"
        if plan_step:
            prompt += (
                f"\n\n【当前教学步骤】\n步骤名称：{plan_step.get('name', '')}"
                f"\n教学内容：{plan_step.get('content', '')}"
            )
        if error_analysis:
            prompt += f"\n\n【学习者的薄弱环节】\n{error_analysis}\n\n请重点针对以上薄弱环节换一种角度讲解。"
        if context:
            prompt += f"\n\n{context}\n\n请优先使用教材证据重新讲解。"
        return {
            "prompt": prompt,
            "system_instruction": system_instruction,
            "temperature": 0.5,
            "max_tokens": 2500,
        }

    def prepare_discuss_prompt(
        self,
        knowledge_point: KnowledgePoint,
        teaching_content: str,
        question: str,
        discussion_history: list = None,
        project_context: str = "",
    ) -> Dict[str, Any]:
        """Build a free-chat request without performing the model call."""
        system_instruction = get_teaching_prompt(
            stage=knowledge_point.get_teaching_stage(),
            topic=knowledge_point.name,
            current_score=knowledge_point.actual_mastery,
        )
        if project_context:
            system_instruction += f"\n\n{project_context}"
        if "【课程教材证据】" in teaching_content:
            system_instruction += (
                "\n\n【课程边界】优先依据给定教材证据回答；"
                "教材外补充必须标注“扩展知识”。"
            )
        prompt = f"基于以下教学内容，回答用户的疑问：\n【教学内容】\n{teaching_content}\n"
        if discussion_history:
            history_lines = []
            for item in discussion_history[-4:]:
                if isinstance(item, (list, tuple)):
                    history_lines.append(f"用户：{item[0]}\nAstraMentor：{item[1]}")
                elif item.get("role") in {"user", "assistant"}:
                    label = "用户" if item.get("role") == "user" else "AstraMentor"
                    history_lines.append(f"{label}：{item.get('content', '')}")
                else:
                    history_lines.append(
                        f"用户：{item.get('question', item.get('user', ''))}\n"
                        f"AstraMentor：{item.get('answer', item.get('assistant', ''))}"
                    )
            history_text = "\n".join(history_lines)
            prompt += f"\n【讨论历史】\n{history_text}\n"
        prompt += (
            f"\n【用户当前问题】{question}\n"
            "请耐心、准确地回答并帮助用户理解当前知识点。"
        )
        return {
            "prompt": prompt,
            "system_instruction": system_instruction,
            "temperature": 0.5,
        }
    
    def generate_teaching_plan(
        self,
        knowledge_point: KnowledgePoint,
        context: str = ""
    ) -> str:
        """
        生成教学计划

        Args:
            knowledge_point: 知识点对象
            context: 学习者前置知识上下文
            
        Returns:
            教学计划 Pydantic 对象
        """
        prompt = get_teaching_plan_prompt(
            topic=knowledge_point.name,
            current_score=knowledge_point.actual_mastery,
            target_score=knowledge_point.target_mastery,
            note=knowledge_point.note
        )
        
        # NOTE: 将前置知识上下文追加到 prompt，让 AI 制定计划时考虑学习者基础
        if context:
            prompt += f"\n\n{context}"
        
        system_instruction = """你是AstraMentor，一位专业的AI教育专家。
你的任务是为学习者制定个性化的教学计划。

【核心原则】
1. 只聚焦当前知识点本身，不要讲解后续/未来的知识点
2. 如果学习者已经掌握了前置知识，直接跳过不需要复习
3. 如果学习者的前置知识薄弱，在计划中安排简要回顾（作为铺垫，不是完整教学）
4. 计划应循序渐进，每一步的描述应该简洁明确
"""

        # NOTE: 结构化 schema，每个教学步骤包含名称、内容和验证方式
        class PlanStep(BaseModel):
            name: str
            content: str
            verification: str

        class PlanSchema(BaseModel):
            goal: str
            steps: list[PlanStep]
        
        plan = self.api_client.generate_json(
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=0.7,
            output_schema=PlanSchema
        )
        
        logger.info(f"已生成知识点 '{knowledge_point.name}' 的教学计划")
        return plan
    
    def teach(
        self,
        knowledge_point: KnowledgePoint,
        plan_step: Optional[Dict[str, str]] = None,
        context: str = "",
        project_context: str = "",
    ) -> Dict[str, Any]:
        """
        进行教学
        
        根据知识点的掌握程度选择合适的教学风格。
        当提供 plan_step 时，严格按照教学计划的当前步骤进行讲解。
        
        Args:
            knowledge_point: 知识点对象
            plan_step: 当前教学计划步骤 dict（可选）
            context: 额外的上下文信息
            project_context: 项目上下文注入文本（项目模式下传入）
            
        Returns:
            包含 content 和 sources 的字典
        """
        stage = knowledge_point.get_teaching_stage()
        is_course_grounded = "【课程教材证据】" in context
        prepared = self.prepare_teach_prompt(
            knowledge_point,
            plan_step=plan_step,
            context=context,
            project_context=project_context,
        )
        
        # NOTE: 根据配置决定是否启用联网搜索
        config = get_config()
        if config.api.web_search_enabled and not is_course_grounded:
            # 启用 Google Search Grounding，获取最新资料
            search_instruction = prepared["system_instruction"] + "\n\n【重要】请充分利用联网搜索到的最新资料来丰富讲解内容，确保信息准确、时效。"
            grounded_response = self.api_client.generate_with_search(
                prompt=prepared["prompt"],
                system_instruction=search_instruction,
                temperature=0.4,
                max_tokens=2500,
                search_query=knowledge_point.name,
            )
            
            logger.info(
                f"已完成知识点 '{knowledge_point.name}' 的阶段{stage}教学"
                f"(联网搜索: {len(grounded_response.sources)} 个来源)"
            )
            return {
                "content": grounded_response.content,
                "sources": [
                    {"title": s.title, "url": s.url}
                    for s in grounded_response.sources
                ],
            }
        else:
            # 回退到原有纯文本行为
            teaching_content = self.api_client.generate(
                **prepared,
            )
            
            logger.info(
                f"已完成知识点 '{knowledge_point.name}' 的阶段{stage}教学"
            )
            return {"content": teaching_content, "sources": []}
    
    def generate_question(
        self,
        knowledge_point: KnowledgePoint,
        plan_step: Optional[Dict[str, str]] = None,
        last_teaching_content: str = "",
        context: str = "",
    ) -> str:
        """
        生成验证问题
        
        根据当前教学阶段生成适合的验证问题
        
        Args:
            knowledge_point: 知识点对象
            
        Returns:
            问题内容
        """
        stage = knowledge_point.get_teaching_stage()
        
        prompt = get_question_prompt(
            topic=knowledge_point.name,
            stage=stage,
            current_score=knowledge_point.actual_mastery
        )
        if plan_step:
            prompt += f"""

【本次测验唯一范围】
步骤名称：{plan_step.get('name', '')}
步骤目标：{plan_step.get('content', '')}

【刚刚完成的教学内容】
{last_teaching_content}

必须只考查上述当前步骤中已经实际讲过的内容。禁止考查后续步骤、其他知识点，
也禁止仅因教材检索结果中出现某个概念就把未讲内容作为答案要求。
"""
        if context:
            prompt += (
                f"\n\n【课程教材参考】\n{context}\n\n"
                "教材只能用于核对事实，不得扩大上面限定的测验范围。"
            )
        
        system_instruction = """你是AstraMentor的提问助手。
请根据学习者的当前水平，生成一个适合的验证问题。
问题应该能够准确评估学习者对知识点的掌握程度。
问题必须严格匹配提示词中的“本次测验唯一范围”和刚刚完成的教学内容。
直接输出问题内容，不要有多余的前缀或解释。

【格式要求】
- 如果是选择题，题干和选项之间空一行，每个选项独占一行
- 示例格式：

以下哪项最能描述xxx？

A) 第一个选项

B) 第二个选项

C) 第三个选项

D) 第四个选项
"""
        
        question = self.api_client.generate(
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=0.6
        )
        
        logger.info(f"已生成知识点 '{knowledge_point.name}' 的验证问题")
        return question.strip()
    
    def reteach_from_errors(
        self,
        knowledge_point: KnowledgePoint,
        plan_step: Optional[Dict[str, str]] = None,
        error_analysis: str = "",
        project_context: str = "",
        context: str = "",
    ) -> Dict[str, Any]:
        """
        针对用户的错误，重新讲解当前步骤的薄弱环节

        Args:
            knowledge_point: 知识点对象
            plan_step: 当前教学步骤
            error_analysis: AI 评价中的错误分析

        Returns:
            包含 content 和 sources 的字典
        """
        prepared = self.prepare_reteach_prompt(
            knowledge_point,
            plan_step=plan_step,
            error_analysis=error_analysis,
            project_context=project_context,
            context=context,
        )
        teaching_content = self.api_client.generate(**prepared)

        logger.info(f"已完成知识点 '{knowledge_point.name}' 的错误重讲")
        return {"content": teaching_content, "sources": []}

    def explain_answer(
        self,
        knowledge_point: KnowledgePoint,
        question: str,
        user_answer: str,
        correct_analysis: str
    ) -> str:
        """
        解释正确答案
        
        当用户回答不够完美时，提供详细的解释
        
        Args:
            knowledge_point: 知识点对象
            question: 原问题
            user_answer: 用户的回答
            correct_analysis: 评分分析
            
        Returns:
            答案解释
        """
        stage = knowledge_point.get_teaching_stage()
        
        system_instruction = get_teaching_prompt(
            stage=stage,
            topic=knowledge_point.name,
            current_score=knowledge_point.actual_mastery
        )
        
        prompt = f"""
【问题】{question}

【用户的回答】{user_answer}

【分析】{correct_analysis}

请基于以上信息，为用户详细解释正确的答案或更好的解法。
保持鼓励的语气，帮助用户理解自己的不足之处。
"""
        
        explanation = self.api_client.generate(
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=0.7
        )
        
        return explanation

    def discuss(
        self,
        knowledge_point: KnowledgePoint,
        teaching_content: str,
        question: str,
        image: Optional[str] = None,
        discussion_history: list = None,
        project_context: str = "",
    ) -> Dict[str, Any]:
        """
        讨论环节
        
        在用户回答问题后，允许用户提出疑问并进行讨论。
        当 Web Research 开启时，讨论中也能引用最新资料。
        
        Args:
            knowledge_point: 知识点对象
            teaching_content: 教学内容
            question: 用户问题
            image: 可选图片
            discussion_history: 讨论历史
            
        Returns:
            包含 content 和 sources 的字典
        """
        is_course_grounded = "【课程教材证据】" in teaching_content
        prepared = self.prepare_discuss_prompt(
            knowledge_point,
            teaching_content=teaching_content,
            question=question,
            discussion_history=discussion_history,
            project_context=project_context,
        )

        # NOTE: 讨论环节同样支持联网搜索，方便解答最新技术问题
        config = get_config()
        if config.api.web_search_enabled and not image and not is_course_grounded:
            # NOTE: 带图片时无法同时使用 google_search，回退到普通模式
            grounded_response = self.api_client.generate_with_search(
                prompt=prepared["prompt"],
                system_instruction=prepared["system_instruction"],
                temperature=0.5,
                max_tokens=1500,
                search_query=f"{knowledge_point.name} {question[:50]}",
            )
            return {
                "content": grounded_response.content,
                "sources": [
                    {"title": s.title, "url": s.url}
                    for s in grounded_response.sources
                ],
            }
        else:
            answer = self.api_client.generate(
                prompt=prepared["prompt"],
                image=image,
                system_instruction=prepared["system_instruction"],
                temperature=prepared["temperature"],
                max_tokens=1500,
            )
            return {"content": answer, "sources": []}
