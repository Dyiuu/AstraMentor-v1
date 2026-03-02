"""
AstraMentor - 双Agent教学系统

主程序入口，实现整体工作流控制
"""

import logging
import sys
from pathlib import Path

from services.learning_service import LearningService
from core.learner_state import LearnerState, KnowledgePoint
from core.constants import LearningLevel
from utils.api_client import APIClient
from core.constants import LearningLevel
from utils.api_client import APIClient
import json


# 配置日志
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class AstraMentor:
    """
    AstraMentor 主控制器 (CLI适配器)

    协调Teacher Agent和Evaluation Agent的工作流
    现在作为 LearningService 的 CLI 包装器
    """

    def __init__(self, state_file: str = "learner_state.json"):
        """
        初始化AstraMentor
        """
        self.service = LearningService(state_file=state_file)
        self.knowledge_graph = self.service.knowledge_graph # Forward compatibility for property access
        self.learner_state = self.service.learner_state
        logger.info("AstraMentor (CLI) 初始化完成")

    def generate_knowledge_graph(
        self,
        topic: str,
        learning_goal: str = "",
        current_level: str = "零基础",
        target_level: str = "掌握核心概念",
    ) -> dict | None:
        """生成知识星图"""
        print("\n" + "=" * 60)
        print(f"🎓 AstraMentor - 知识星图生成器")
        print("=" * 60)
        print(f"\n📚 主题: {topic}")
        print(f"🎯 目的: {learning_goal}")
        print(f"📊 当前水平: {current_level}")
        print(f"🚀 目标水平: {target_level}")
        print()

        print("🌟 正在生成知识星图...")
        graph_data = self.service.generate_knowledge_graph(
            topic=topic,
            learning_goal=learning_goal,
            current_level=current_level,
            target_level=target_level
        )
        
        if not graph_data:
            print(f"❌ 知识星图生成失败")
            print("请检查API配置或稍后重试")
            return None

        # 显示图谱摘要 (Assuming knowledge_graph agent details are available via service)
        summary = self.service.knowledge_graph.format_graph_summary(graph_data)
        print("\n" + summary)
        print(f"✅ 知识星图已保存到 test_data 目录")

        choice = (
            input("\n请选择操作 [Y]确认图谱 / [R]重新生成 / [Q]退出: ").strip().upper()
        )
        if choice == "Q":
            print("\n👋 已取消")
            return None
        elif choice == "R":
            return self.generate_knowledge_graph(
                topic, learning_goal, current_level, target_level
            )

        return graph_data

    def start_learning(
        self,
        node_name: str,
        node_description: str = "",
        user_note: str = "",
        target_mastery: float = 0.8,
        current_mastery: float = 0.0,
    ) -> None:
        """开始学习一个知识节点"""
        print("\n" + "=" * 60)
        print(f"🎓 AstraMentor - AI教学助手")
        print("=" * 60)
        print(f"\n📖 开始学习: {node_name}")
        if node_description:
            print(f"📝 描述: {node_description}")
        if user_note:
            print(f"💬 你的需求: {user_note}")
        print(f"📊 当前掌握度: {current_mastery:.1%}")
        print(f"🎯 目标掌握度: {target_mastery:.1%}")
        print()

        kp = self.service.start_learning(
            node_name=node_name,
            node_description=node_description,
            user_note=user_note,
            target_mastery=target_mastery,
            current_mastery=current_mastery
        )

        plan = self._generate_and_confirm_plan(kp)
        if plan is None:
            print("\n👋 学习已取消，下次再见！")
            return

        self._teaching_loop(kp)
        self._show_completion_summary(kp)

    def _generate_and_confirm_plan(self, knowledge_point: KnowledgePoint) -> str | None:
        """生成教学计划并确认"""
        while True:
            print("🔄 正在生成教学计划...")
            plan = self.service.generate_teaching_plan(knowledge_point)

            print("\n📋 教学计划:")
            print("-" * 50)
            print(plan)
            print("-" * 50)

            choice = (
                input("\n请选择操作 [Y]接受 / [N]重新生成 / [Q]取消: ").strip().upper()
            )

            if choice == "Y" or choice == "":
                return plan
            elif choice == "Q":
                return None
            elif choice == "N":
                note = input("请输入修改意见（直接回车跳过）: ").strip()
                if note:
                    knowledge_point.note = note
                continue
            else:
                print("⚠️ 无效输入，请重新选择")

    def _teaching_loop(self, knowledge_point: KnowledgePoint) -> None:
        """教学循环"""
        iteration = 0
        max_iterations = 20

        while not knowledge_point.is_mastered() and iteration < max_iterations:
            iteration += 1
            print(f"\n{'='*60}")
            print(f"📖 第 {iteration} 轮学习")
            print(f"{'='*60}")

            print("\n🎓 正在讲解...")
            teach_result = self.service.teach(knowledge_point)
            # NOTE: teach() 现在返回 {"content": str, "sources": list}
            teaching_content = teach_result["content"] if isinstance(teach_result, dict) else teach_result
            print("\n" + teaching_content)

            current_discussion_round = 0
            max_discussion_rounds = 10
            discussion_history = []

            while current_discussion_round < max_discussion_rounds:
                print("\n💬 讨论环节:")
                print("你可以就刚才的内容提出问题或讨论！")
                question = input("请输入你的问题（直接回车跳过讨论环节）: ").strip()
                
                if question:
                    discuss_result = self.service.discuss(
                        knowledge_point=knowledge_point,
                        teaching_content=teaching_content,
                        question=question,
                        history=discussion_history
                    )
                    # NOTE: discuss() 现在返回 {"content": str, "sources": list}
                    discussion_response = discuss_result["content"] if isinstance(discuss_result, dict) else discuss_result
                    print("\n" + discussion_response)
                    discussion_history.append(
                        {"question": question, "response": discussion_response}
                    )
                else:
                    print("跳过讨论环节。")
                    break

                if current_discussion_round % 3 == 2:
                    user_input = input(
                        f"\n你有信心进入测试，来检测你对当前知识点的掌握程度吗？[(Yes)进入测试/(No)继续学习]: "
                    ).strip()
                    if user_input in ["Yes", "进入测试"]:
                        break
                    elif user_input in ["No", "继续学习"]:
                        print("\n🎓 继续讲解...")
                        current_discussion_round += 1
                    else:
                        print("无效输入，请输入 '继续' 或 '退出'")
                current_discussion_round += 1

            print("\n❓ 测试问题，用来检验你的掌握情况:")
            question = self.service.generate_question(knowledge_point)
            print(question)

            print("\n请输入你的回答（输入多行时，输入空行结束）:")
            answer_lines = []
            while True:
                line = input()
                if line == "":
                    break
                answer_lines.append(line)
            answer = "\n".join(answer_lines)

            if not answer.strip():
                print("⚠️ 回答不能为空，请重新输入")
                continue

            print("\n🔍 正在评估...")
            # Note: service.evaluate_answer returns EvaluationResult
            evaluation = self.service.evaluate_answer(
                knowledge_point=knowledge_point,
                question=question,
                answer=answer
            )
            
            # Using service to get feedback string
            feedback = self.service.get_progress_feedback(evaluation, knowledge_point)
            
            # Re-fetch KP to ensure updated state is used
            knowledge_point = self.service.get_knowledge_point(knowledge_point.name)
            
            print("\n" + feedback)

            if evaluation.score < 0.8:
                print("\n📝 答案解析:")
                explanation = self.service.explain_answer(
                    knowledge_point=knowledge_point,
                    question=question,
                    user_answer=answer,
                    correct_analysis=evaluation.analysis
                )
                print(explanation)

            if knowledge_point.is_mastered():
                print("\n🎉 恭喜！你已经掌握了这个知识点！")
                break

            choice = input("\n是否继续学习？[Y]继续 / [Q]退出: ").strip().upper()
            if choice == "Q":
                break

    def _show_completion_summary(self, knowledge_point: KnowledgePoint) -> None:
        """显示学习完成摘要"""
        print("\n" + "=" * 60)
        print("📊 学习总结")
        print("=" * 60)
        print(f"知识点: {knowledge_point.name}")
        print(f"最终掌握度: {knowledge_point.actual_mastery:.1%}")
        print(f"目标掌握度: {knowledge_point.target_mastery:.1%}")
        print(f"学习轮数: {len(knowledge_point.history)}")

        if knowledge_point.is_mastered():
            print("\n✅ 恭喜！你已成功达到学习目标！")
        else:
            remaining = knowledge_point.target_mastery - knowledge_point.actual_mastery
            print(f"\n⏳ 继续加油！距离目标还差 {remaining:.1%}")

        summary = self.service.get_learner_state_summary()
        print(f"\n📈 总体学习进度:")
        print(f"   已学知识点: {summary['total']} 个")
        print(f"   已掌握: {summary['mastered']} 个")
        print(f"   平均掌握度: {summary['average_mastery']:.1%}")


def main():
    """主函数"""
    print("=" * 60)
    print("  🌟 欢迎使用 AstraMentor - AI教学助手 🌟")
    print("=" * 60)

    # 测试API连接
    print("\n正在测试API连接...")
    client = APIClient()
    if not client.test_connection():
        print("❌ API连接失败，请检查配置")
        print("提示: 确保Antigravity代理服务正在运行（http://127.0.0.1:8045）")
        sys.exit(1)
    print("✅ API连接成功！")

    # 创建主程序
    mentor = AstraMentor()

    # 获取用户输入
    print("\n📋 请告诉我你想学习什么？")
    print()
    topic = input("📚 学习主题: ").strip()
    if not topic:
        print("❌ 主题名称不能为空")
        sys.exit(1)

    print("\n🎯 学习目的（可选，例如：用于开发Web应用、准备面试等）:")
    learning_goal = input("   ").strip()

    # 当前水平
    print("\n📊 你的当前水平:")
    for option in LearningLevel.display_current_options():
        print(f"   {option}")
    current_choice = input("   请选择 (1-4，默认1): ").strip() or "1"
    current_level = LearningLevel.get_current_level(current_choice)

    # 目标水平
    print("\n🚀 你的目标水平:")
    for option in LearningLevel.display_target_options():
        print(f"   {option}")
    target_choice = input("   请选择 (1-4，默认4): ").strip() or "4"
    target_level = LearningLevel.get_target_level(target_choice)

    # 第一步：生成知识星图
    graph_data = mentor.generate_knowledge_graph(
        topic=topic,
        learning_goal=learning_goal,
        current_level=current_level,
        target_level=target_level,
    )
    if graph_data is None:
        print("\n👋 已退出")
        sys.exit(0)

    # 第二步：选择要学习的节点
    learning_path = mentor.knowledge_graph.get_learning_path(graph_data)
    print(
        f"\n建议学习顺序: {' → '.join([n['name'] for n in graph_data['nodes'] if n['id'] in learning_path[:3]])}..."
    )
    print("\n可用的知识节点：")
    for i, node in enumerate(graph_data["nodes"], 1):
        attrs = node.get("attributes", {})
        weight_a = attrs.get("weight_A", 0.0)
        weight_b = attrs.get("weight_B", 0.8)
        print(f"  {i}. {node['name']} (当前:{weight_a:.1%} → 目标:{weight_b:.1%})")

    node_choice = input("\n请选择要学习的节点编号（直接回车选择第一个）: ").strip()
    if not node_choice:
        selected_node = graph_data["nodes"][0]
    else:
        try:
            idx = int(node_choice) - 1
            selected_node = graph_data["nodes"][idx]
        except (ValueError, IndexError):
            print("❌ 无效的选择，自动选择第一个节点")
            selected_node = graph_data["nodes"][0]

    # 获取节点属性
    selected_attrs = selected_node.get("attributes", {})
    current = selected_attrs.get("weight_A", 0.0)
    target = selected_attrs.get("weight_B", 0.8)

    print(f"\n已选择: {selected_node['name']}")
    # 显示 AI 生成的知识点描述
    if selected_attrs.get("description"):
        print(f"📝 描述: {selected_attrs['description']}")

    # 第三步：确认学习程度并添加个性化备注
    print(f"\n{'='*60}")
    print("📊 AI 分析的学习程度")
    print(f"{'='*60}")
    print(f"   当前掌握度: {current:.1%}")
    print(f"   目标掌握度: {target:.1%}")

    # 询问是否需要调整
    print(f"\n💡 提示：这是 AI 根据你的整体水平分析的结果")
    adjust = input("是否需要调整此节点的学习程度？[y/N]: ").strip().lower()

    if adjust == "y":
        print("\n请输入新的学习程度：")
        try:
            new_current = input(
                f"  当前掌握度 (0-100，默认{int(current*100)}): "
            ).strip()
            if new_current:
                current = float(new_current) / 100.0
                current = max(0.0, min(1.0, current))  # 限制在 0-1 之间

            new_target = input(f"  目标掌握度 (0-100，默认{int(target*100)}): ").strip()
            if new_target:
                target = float(new_target) / 100.0
                target = max(0.0, min(1.0, target))  # 限制在 0-1 之间

            print(f"\n✅ 已更新：当前 {current:.1%} → 目标 {target:.1%}")
        except ValueError:
            print("⚠️  输入无效，使用原有数值")

    # 输入个性化备注
    print(f"\n{'='*60}")
    print("💬 个性化学习需求（可选）")
    print(f"{'='*60}")
    print("例如: '重点关注实际项目应用'、'需要更多代码示例'、'准备面试'等")
    user_note = input("备注: ").strip()

    # 更新节点数据（包括可能修改的 weight_A、weight_B 和 user_note）
    has_changes = False
    if current != selected_attrs.get("weight_A", 0.0):
        selected_attrs["weight_A"] = current
        has_changes = True
    if target != selected_attrs.get("weight_B", 0.8):
        selected_attrs["weight_B"] = target
        has_changes = True
    if user_note:
        selected_attrs["user_note"] = user_note
        has_changes = True

    # 保存更新后的数据到文件
    if has_changes:
        selected_node["attributes"] = selected_attrs
        test_data_dir = Path("test_data")
        graph_filename = (
            f"knowledge_graph_{topic.replace(' ', '_').replace('/', '_')}.json"
        )
        graph_file = test_data_dir / graph_filename
        with open(graph_file, "w", encoding="utf-8") as f:
            json.dump(graph_data, f, ensure_ascii=False, indent=2)
        print(f"✅ 已保存更新到知识星图")

    # 第四步：开始学习
    print(f"\n📊 学习参数（基于 AI 分析）：")
    print(f"   当前掌握度: {current:.1%}")
    print(f"   目标掌握度: {target:.1%}")

    mentor.start_learning(
        node_name=selected_node["name"],
        node_description=selected_attrs.get("description", ""),  # AI 生成的描述
        user_note=selected_attrs.get("user_note", ""),  # 用户的备注
        target_mastery=target,
        current_mastery=current,
    )


if __name__ == "__main__":
    main()
