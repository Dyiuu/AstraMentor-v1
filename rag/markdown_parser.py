"""Markdown parsing and heading-aware chunks with source line metadata."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import re
from typing import Any, Iterable


HEADING_PATTERN = re.compile(r"^(#{1,6})\s+(.+?)\s*$")


@dataclass(frozen=True)
class MarkdownChunk:
    chunk_id: str
    course_id: str
    material_id: str
    document_title: str
    source_path: str
    section_path: tuple[str, ...]
    line_start: int
    line_end: int
    text: str
    content_hash: str

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["section_path"] = list(self.section_path)
        return data


@dataclass(frozen=True)
class _Block:
    section_path: tuple[str, ...]
    line_start: int
    line_end: int
    text: str


def _paragraph_blocks(markdown: str) -> list[_Block]:
    lines = markdown.splitlines()
    headings: list[str] = []
    blocks: list[_Block] = []
    current: list[str] = []
    current_start = 1
    current_section: tuple[str, ...] = ()
    in_code = False

    def flush(line_end: int) -> None:
        nonlocal current
        text = "\n".join(current).strip()
        if text:
            blocks.append(
                _Block(
                    section_path=current_section,
                    line_start=current_start,
                    line_end=max(current_start, line_end),
                    text=text,
                )
            )
        current = []

    for line_no, line in enumerate(lines, start=1):
        heading = HEADING_PATTERN.match(line) if not in_code else None
        if heading:
            flush(line_no - 1)
            level = len(heading.group(1))
            title = heading.group(2).strip()
            headings = headings[: level - 1]
            while len(headings) < level - 1:
                headings.append("")
            headings.append(title)
            current_section = tuple(value for value in headings if value)
            current_start = line_no + 1
            continue

        if line.strip().startswith("```"):
            if not current:
                current_start = line_no
            current.append(line)
            in_code = not in_code
            continue

        if not line.strip() and not in_code:
            flush(line_no - 1)
            current_start = line_no + 1
            continue

        if not current:
            current_start = line_no
        current.append(line)

    flush(len(lines))
    return blocks


def _split_long_block(block: _Block, max_chars: int, overlap_chars: int) -> list[_Block]:
    if len(block.text) <= max_chars:
        return [block]
    result: list[_Block] = []
    start = 0
    step = max(1, max_chars - overlap_chars)
    while start < len(block.text):
        piece = block.text[start : start + max_chars].strip()
        if piece:
            result.append(
                _Block(
                    section_path=block.section_path,
                    line_start=block.line_start,
                    line_end=block.line_end,
                    text=piece,
                )
            )
        if start + max_chars >= len(block.text):
            break
        start += step
    return result


def build_chunks(
    *,
    markdown: str,
    course_id: str,
    material_id: str,
    document_title: str,
    source_path: str,
    target_chars: int = 700,
    max_chars: int = 900,
    overlap_chars: int = 120,
) -> list[MarkdownChunk]:
    if not 0 <= overlap_chars < max_chars:
        raise ValueError("overlap_chars must be smaller than max_chars")

    raw_blocks: list[_Block] = []
    for block in _paragraph_blocks(markdown):
        raw_blocks.extend(_split_long_block(block, max_chars, overlap_chars))

    grouped: list[_Block] = []
    pending: list[_Block] = []

    def flush_pending() -> None:
        nonlocal pending
        if not pending:
            return
        grouped.append(
            _Block(
                section_path=pending[0].section_path,
                line_start=pending[0].line_start,
                line_end=pending[-1].line_end,
                text="\n\n".join(block.text for block in pending),
            )
        )
        pending = []

    for block in raw_blocks:
        pending_text_length = sum(len(item.text) for item in pending)
        crosses_section = pending and pending[0].section_path != block.section_path
        would_overflow = pending and pending_text_length + len(block.text) > max_chars
        if crosses_section or would_overflow:
            flush_pending()
        pending.append(block)
        if sum(len(item.text) for item in pending) >= target_chars:
            flush_pending()
    flush_pending()

    chunks: list[MarkdownChunk] = []
    identity_occurrences: dict[str, int] = {}
    for block in grouped:
        content_hash = hashlib.sha256(block.text.encode("utf-8")).hexdigest()
        base_identity = "|".join(
            [course_id, material_id, "/".join(block.section_path), content_hash]
        )
        occurrence = identity_occurrences.get(base_identity, 0)
        identity_occurrences[base_identity] = occurrence + 1
        # Repeated boilerplate can legitimately occur under the same heading.
        # Preserve the original stable id for the first occurrence and add a
        # deterministic ordinal only when needed, so BM25/vector references
        # cannot collapse two source ranges into one chunk id.
        identity = (
            base_identity
            if occurrence == 0
            else f"{base_identity}|occurrence:{occurrence}"
        )
        chunk_id = f"{course_id}:{hashlib.sha256(identity.encode('utf-8')).hexdigest()[:12]}"
        chunks.append(
            MarkdownChunk(
                chunk_id=chunk_id,
                course_id=course_id,
                material_id=material_id,
                document_title=document_title,
                source_path=source_path,
                section_path=block.section_path,
                line_start=block.line_start,
                line_end=block.line_end,
                text=block.text,
                content_hash=content_hash,
            )
        )
    return chunks


def section_catalog(chunks: Iterable[MarkdownChunk]) -> list[str]:
    seen: set[tuple[str, ...]] = set()
    catalog: list[str] = []
    for chunk in chunks:
        if chunk.section_path and chunk.section_path not in seen:
            seen.add(chunk.section_path)
            catalog.append(" > ".join(chunk.section_path))
    return catalog
