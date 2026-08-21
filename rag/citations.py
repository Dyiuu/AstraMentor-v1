"""Citation normalization and prompt context for course evidence."""

from __future__ import annotations

from typing import Any, Iterable

from rag.retriever import RetrievalResult


def citation_from_result(result: RetrievalResult, excerpt_chars: int = 220) -> dict[str, Any]:
    chunk = result.chunk
    text = str(chunk.get("text", "")).strip()
    excerpt = text[:excerpt_chars] + ("…" if len(text) > excerpt_chars else "")
    return {
        "citation_id": chunk["chunk_id"],
        "course_id": chunk["course_id"],
        "document_title": chunk["document_title"],
        "section_path": chunk.get("section_path", []),
        "excerpt": excerpt,
        "source_file": chunk["source_path"],
        "line_start": chunk["line_start"],
        "line_end": chunk["line_end"],
        "score": result.score,
        "retrieval": result.retrieval,
    }


def citations_from_results(results: Iterable[RetrievalResult]) -> list[dict[str, Any]]:
    return [citation_from_result(result) for result in results]


def build_course_context(results: Iterable[RetrievalResult]) -> str:
    blocks: list[str] = []
    for result in results:
        chunk = result.chunk
        section = " > ".join(chunk.get("section_path", [])) or "未命名章节"
        blocks.append(
            f"[引用ID: {chunk['chunk_id']}]\n"
            f"章节: {section}\n"
            f"原文: {chunk['text']}"
        )
    if not blocks:
        return ""
    return (
        "【课程教材证据】\n"
        "优先依据以下教材片段回答。不得编造引用；如果需要补充教材外知识，"
        "请明确标注“扩展知识”。\n\n" + "\n\n---\n\n".join(blocks)
    )


def validate_citation_ids(
    citation_ids: Iterable[str], results: Iterable[RetrievalResult]
) -> list[dict[str, Any]]:
    allowed = {result.chunk["chunk_id"]: result for result in results}
    seen: set[str] = set()
    validated: list[dict[str, Any]] = []
    for citation_id in citation_ids:
        if citation_id in allowed and citation_id not in seen:
            seen.add(citation_id)
            validated.append(citation_from_result(allowed[citation_id]))
    return validated
