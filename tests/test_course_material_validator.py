from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from rag.content_validator import REQUIRED_SECTIONS, validate_material


def _valid_markdown() -> str:
    sections: list[str] = ["# 项目一：构建可靠模型客户端"]
    long_text = (
        "本段从岗位任务、输入数据、预期输出、运行边界和验收方法五个方面说明工程决策。"
        "学习者需要先观察现象，再记录证据，最后依据接口契约定位问题并验证修复结果。"
        "每一次操作都应保存命令、响应、时间和判断依据，使另一位工程师能够复现实训过程。"
    ) * 5
    for name in REQUIRED_SECTIONS:
        sections.append(f"## {name}")
        if name == "项目产物与验收条件":
            sections.append(
                "- 输入：一份任务说明和环境变量配置。\n"
                "- 输出：可运行客户端与测试记录。\n"
                "- 验收证据：成功响应、错误日志和检查表。"
            )
        elif name == "任务分析":
            sections.append(
                "### 4 学时活动安排\n\n"
                "| 阶段 | 时间 | 活动 |\n|---|---:|---|\n"
                "| 任务导入 | 30 分钟 | 分析需求 |\n"
                "| 知识准备 | 50 分钟 | 阅读契约 |\n"
                "| 编码实训 | 100 分钟 | 完成实现 |\n"
                "| 排错评价 | 60 分钟 | 复盘验收 |\n"
                "| 合计 | 240 分钟 | 完成闭环 |"
            )
        elif name == "工程实现步骤":
            sections.append(
                "### 步骤一：准备输入\n记录参数。\n\n"
                "### 步骤二：执行实现\n运行程序。\n\n"
                "### 步骤三：验证输出\n保存证据。"
            )
        elif name == "关键代码与配置":
            sections.append("```python\napi_key = \"YOUR_API_KEY\"\nprint(\"ready\")\n```")
        elif name == "调试和常见故障":
            sections.append(
                "### 故障一：请求超时\n- 现象：无响应。\n- 原因：超时过短。\n- 定位：检查日志。\n- 修复：调整超时。\n\n"
                "### 故障二：参数错误\n- 现象：返回 400。\n- 原因：字段缺失。\n- 定位：核对请求。\n- 修复：补齐字段。"
            )
        elif name == "学习评价量表":
            sections.append("| 指标 | 合格标准 |\n|---|---|\n| 功能 | 测试通过 |")
        elif name == "官方参考资料与核验日期":
            sections.append(
                "- [Python 官方文档](https://docs.python.org/3/)\n- 核验日期：2026-08-20"
            )
        else:
            sections.append(long_text)
    return "\n\n".join(sections)


class CourseMaterialValidatorTests(unittest.TestCase):
    def _write(self, markdown: str) -> Path:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        directory = Path(temporary.name)
        path = directory / "project.md"
        path.write_text(markdown, encoding="utf-8")
        return path

    def test_valid_material_passes(self) -> None:
        issues = validate_material(self._write(_valid_markdown()))
        self.assertEqual([], issues)

    def test_structure_and_hours_are_enforced(self) -> None:
        markdown = _valid_markdown().replace("| 合计 | 240 分钟", "| 合计 | 180 分钟")
        markdown = markdown.replace("## 项目目标", "## 被改坏的章节")
        codes = {item.code for item in validate_material(self._write(markdown))}
        self.assertIn("section_order", codes)
        self.assertIn("activity_hours", codes)

    def test_fault_details_and_secrets_are_enforced(self) -> None:
        markdown = _valid_markdown().replace("- 修复：调整超时。", "- 处理：调整超时。")
        markdown += "\nASTRA_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456\n"
        codes = {item.code for item in validate_material(self._write(markdown))}
        self.assertIn("fault_detail", codes)
        self.assertIn("secret", codes)
        self.assertIn("secret_assignment", codes)


if __name__ == "__main__":
    unittest.main()
