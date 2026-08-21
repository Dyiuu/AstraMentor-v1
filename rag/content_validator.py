"""Validate vocational course materials before they enter the RAG index."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
from pathlib import Path
import re
from typing import Iterable

from rag.course_registry import CourseRegistry


REQUIRED_SECTIONS = (
    "岗位情境",
    "项目目标",
    "项目产物与验收条件",
    "任务分析",
    "核心知识",
    "工程实现步骤",
    "关键代码与配置",
    "调试和常见故障",
    "安全、成本与职业规范提示",
    "实训练习",
    "学习评价量表",
    "本项目小结",
    "官方参考资料与核验日期",
)
UNFINISHED_PATTERN = re.compile(r"\b(?:TODO|TBD)\b|待补充|稍后补充|内容省略", re.IGNORECASE)
H1_PATTERN = re.compile(r"^#\s+项目(?:[一二三四五六七八]|[1-8])[:：].+", re.MULTILINE)
H2_PATTERN = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
FENCE_PATTERN = re.compile(r"^```[^\n]*\n[\s\S]+?^```\s*$", re.MULTILINE)
HTTPS_PATTERN = re.compile(r"https://[^\s)>]+")

SECRET_PATTERNS = (
    ("openai_key", re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b")),
    ("google_key", re.compile(r"\bAIza[A-Za-z0-9_-]{20,}\b")),
    ("github_token", re.compile(r"\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b")),
    ("aws_key", re.compile(r"\bAKIA[A-Z0-9]{16}\b")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
    ("private_key", re.compile(r"BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY")),
    ("credential_url", re.compile(r"https?://[^\s/:]+:[^\s/@]+@")),
)
ENV_SECRET_PATTERN = re.compile(
    r"(?im)^\s*[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)\s*=\s*([^\s#]+)"
)
ALLOWED_SECRET_VALUES = re.compile(
    r"^(?:YOUR_[A-Z0-9_]+|\$\{[A-Z0-9_]+\}|<[A-Z0-9_-]*PLACEHOLDER>|['\"]?['\"]?)$"
)


@dataclass(frozen=True)
class ValidationIssue:
    path: str
    code: str
    message: str

    def to_dict(self) -> dict[str, str]:
        return {"path": self.path, "code": self.code, "message": self.message}


def _sections(markdown: str) -> tuple[list[str], dict[str, str]]:
    matches = list(H2_PATTERN.finditer(markdown))
    names = [match.group(1).strip() for match in matches]
    content: dict[str, str] = {}
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        content[match.group(1).strip()] = markdown[start:end].strip()
    return names, content


def _activity_minutes(task_analysis: str) -> tuple[int, int | None]:
    marker = re.search(r"^###\s+4\s*学时活动安排\s*$", task_analysis, re.MULTILINE)
    if not marker:
        return 0, None
    tail = task_analysis[marker.end() :]
    next_heading = re.search(r"^###\s+", tail, re.MULTILINE)
    table = tail[: next_heading.start()] if next_heading else tail
    minutes = 0
    stated_total: int | None = None
    for line in table.splitlines():
        if "|" not in line or re.search(r"\|\s*:?-+", line):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) < 2:
            continue
        match = re.search(r"(\d+)\s*分钟", cells[1])
        if not match:
            continue
        value = int(match.group(1))
        if "合计" in cells[0]:
            stated_total = value
        else:
            minutes += value
    return minutes, stated_total


def _fault_blocks(section: str) -> list[str]:
    matches = list(re.finditer(r"^###\s+故障[^\n]*$", section, re.MULTILINE))
    blocks: list[str] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(section)
        blocks.append(section[match.start() : end])
    return blocks


def _effective_text_length(markdown: str) -> int:
    text = FENCE_PATTERN.sub("", markdown)
    text = re.sub(r"(?m)^\s*\|.*\|\s*$", "", text)
    text = re.sub(r"(?m)^#{1,6}\s+", "", text)
    return len(re.sub(r"\s+", "", text))


def validate_material(path: Path, *, verified_date: str = "2026-08-20") -> list[ValidationIssue]:
    markdown = path.read_text(encoding="utf-8")
    issues: list[ValidationIssue] = []

    def issue(code: str, message: str) -> None:
        issues.append(ValidationIssue(str(path), code, message))

    if not H1_PATTERN.search(markdown):
        issue("project_title", "一级标题必须使用“项目N：领域任务名”格式")

    names, sections = _sections(markdown)
    if names != list(REQUIRED_SECTIONS):
        issue("section_order", "13 个二级章节缺失、重复或顺序不正确")
    for name in REQUIRED_SECTIONS:
        if not sections.get(name, "").strip():
            issue("empty_section", f"章节“{name}”不能为空")

    outcomes = sections.get("项目产物与验收条件", "")
    for keyword in ("输入", "输出", "验收证据"):
        if keyword not in outcomes:
            issue("deliverable_contract", f"项目产物章节必须明确“{keyword}”")
    if "|" not in outcomes and not re.search(r"(?m)^\s*[-*]\s+", outcomes):
        issue("acceptance_list", "项目产物章节必须包含验收清单或表格")

    minutes, stated_total = _activity_minutes(sections.get("任务分析", ""))
    if stated_total != 240 or minutes != 240:
        issue("activity_hours", "4 学时活动安排的分项和合计都必须为 240 分钟")

    implementation = sections.get("工程实现步骤", "")
    step_headings = len(re.findall(r"^###\s+步骤", implementation, re.MULTILINE))
    numbered_steps = len(re.findall(r"(?m)^\s*\d+[.、]\s+", implementation))
    if max(step_headings, numbered_steps) < 3:
        issue("reproducible_steps", "工程实现至少需要 3 个明确、可复现的步骤")

    if not FENCE_PATTERN.search(markdown):
        issue("code_block", "每个项目至少需要一个 fenced 代码或配置块")
    for block in FENCE_PATTERN.findall(markdown):
        if len(block) > 900:
            issue("code_block_length", "单个代码块应小于 900 字符，避免 RAG 硬切分")

    faults = _fault_blocks(sections.get("调试和常见故障", ""))
    if len(faults) < 2:
        issue("fault_count", "调试章节至少需要两个以“故障”开头的三级小节")
    for index, block in enumerate(faults, start=1):
        for keyword in ("现象", "原因", "定位", "修复"):
            if keyword not in block:
                issue("fault_detail", f"故障案例 {index} 缺少“{keyword}”")

    rubric = sections.get("学习评价量表", "")
    if not re.search(r"(?m)^\s*\|.+\|\s*$", rubric):
        issue("rubric", "学习评价量表必须使用 Markdown 表格")

    references = sections.get("官方参考资料与核验日期", "")
    if not HTTPS_PATTERN.search(references):
        issue("official_source", "参考资料章节至少需要一个 HTTPS 官方来源")
    if verified_date not in references:
        issue("verified_date", f"参考资料章节必须记录核验日期 {verified_date}")

    if _effective_text_length(markdown) < 2500:
        issue("body_too_short", "有效正文少于 2500 个非空白字符，无法支撑完整项目实训")
    if UNFINISHED_PATTERN.search(markdown):
        issue("unfinished", "教材包含未完成占位内容")

    for name, pattern in SECRET_PATTERNS:
        if pattern.search(markdown):
            issue("secret", f"疑似包含真实凭据：{name}")
    for match in ENV_SECRET_PATTERN.finditer(markdown):
        value = match.group(1).strip().strip("'\"")
        if value and not ALLOWED_SECRET_VALUES.fullmatch(value):
            issue("secret_assignment", "敏感环境变量必须使用明确占位符")

    return issues


def _paragraphs(markdown: str) -> Iterable[str]:
    for paragraph in re.split(r"\n\s*\n", markdown):
        normalized = re.sub(r"\s+", "", paragraph)
        if len(normalized) > 100 and not paragraph.lstrip().startswith(("#", "|", "```")):
            yield normalized


def validate_course(course_id: str, registry: CourseRegistry | None = None) -> list[ValidationIssue]:
    active_registry = registry or CourseRegistry()
    course = active_registry.get(course_id)
    issues: list[ValidationIssue] = []
    paragraph_owner: dict[str, str] = {}
    for material in course.materials:
        issues.extend(validate_material(material.path))
        markdown = material.path.read_text(encoding="utf-8")
        for paragraph in _paragraphs(markdown):
            previous = paragraph_owner.get(paragraph)
            if previous:
                issues.append(
                    ValidationIssue(
                        str(material.path),
                        "duplicate_paragraph",
                        f"与 {previous} 存在超过 100 字的完全重复正文",
                    )
                )
            else:
                paragraph_owner[paragraph] = str(material.path)
    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate AstraMentor course materials")
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--course", help="Course id to validate")
    target.add_argument(
        "--all",
        action="store_true",
        help="Validate all project-format courses (courses with declared hours)",
    )
    args = parser.parse_args()

    registry = CourseRegistry()
    # The original ``agent-design`` textbook predates the 13-section project
    # template and intentionally keeps its legacy layout.  Declared hours mark
    # curricula that opt in to the strict vocational-project content gate.
    course_ids = (
        [args.course]
        if args.course
        else [course.id for course in registry.list_courses() if course.hours > 0]
    )
    all_issues: list[ValidationIssue] = []
    for course_id in course_ids:
        try:
            all_issues.extend(validate_course(course_id, registry))
        except KeyError as exc:
            all_issues.append(ValidationIssue(str(course_id), "course_not_found", str(exc)))
    print(json.dumps([item.to_dict() for item in all_issues], ensure_ascii=False, indent=2))
    return 1 if all_issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
