"""
PDF 文件解析服务

负责：
1. 提取 PDF 全文文本
2. 按页/段落分块，保留页码信息
3. 生成文件指纹用于去重
"""

import hashlib
import logging
import re
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class DocumentChunk(BaseModel):
    """文档分块"""

    chunk_id: str = Field(..., description="分块唯一 ID")
    content: str = Field(..., description="文本内容")
    page_start: int = Field(..., description="起始页码（从 1 开始）")
    page_end: int = Field(..., description="结束页码")
    heading: str = Field(default="", description="所属章节标题")


class DocumentContext(BaseModel):
    """解析后的完整文档上下文"""

    doc_id: str = Field(..., description="文件指纹 (MD5)")
    filename: str = Field(..., description="原始文件名")
    total_pages: int = Field(..., description="总页数")
    chunks: list[DocumentChunk] = Field(default_factory=list, description="分块列表")
    full_text: str = Field(default="", description="全文文本（用于摘要生成）")


# NOTE: 章节标题检测模式
# 匹配中文数字序号（一、二、三…）、阿拉伯数字序号（1. 2. 3…）、英文编号（Chapter、Section）
_HEADING_PATTERNS = [
    re.compile(r"^[第]?[一二三四五六七八九十百千]+[章节篇部分]\s*.+"),
    re.compile(r"^\d+(\.\d+)*\s+\S+"),
    re.compile(r"^(Chapter|Section|Part)\s+\d+", re.IGNORECASE),
    re.compile(r"^(摘\s*要|Abstract|引\s*言|Introduction|结\s*论|Conclusion|参考文献|References)", re.IGNORECASE),
]

# NOTE: 需要合并的超短段落阈值（字符数）
_MIN_CHUNK_LENGTH = 80

# NOTE: 控制单个分块的最大长度，避免超长段落
_MAX_CHUNK_LENGTH = 3000


def _compute_file_hash(file_bytes: bytes) -> str:
    """计算文件 MD5 哈希值作为唯一标识"""
    return hashlib.md5(file_bytes).hexdigest()


def _is_heading(text: str) -> bool:
    """判断一行文本是否为章节标题"""
    stripped = text.strip()
    if not stripped or len(stripped) > 100:
        return False
    return any(p.match(stripped) for p in _HEADING_PATTERNS)


def _merge_short_paragraphs(paragraphs: list[str]) -> list[str]:
    """
    合并过短的相邻段落，避免生成过多碎片化分块

    NOTE: 连续的短段落会合并到一起，直到达到最小长度阈值
    """
    if not paragraphs:
        return []

    merged: list[str] = []
    buffer = ""

    for para in paragraphs:
        if not para.strip():
            continue
        if buffer:
            buffer += "\n" + para
        else:
            buffer = para

        if len(buffer) >= _MIN_CHUNK_LENGTH:
            merged.append(buffer)
            buffer = ""

    # 尾部残留
    if buffer:
        if merged:
            merged[-1] += "\n" + buffer
        else:
            merged.append(buffer)

    return merged


def parse_pdf(file_bytes: bytes, filename: str) -> DocumentContext:
    """
    解析 PDF 文件，提取文本并按段落/章节分块

    Args:
        file_bytes: PDF 文件的二进制内容
        filename: 原始文件名

    Returns:
        DocumentContext 对象，包含全文和分块信息
    """
    import fitz  # PyMuPDF

    doc_id = _compute_file_hash(file_bytes)
    logger.info(f"开始解析 PDF: {filename} (hash={doc_id[:8]}...)")

    doc = fitz.open(stream=file_bytes, filetype="pdf")
    total_pages = len(doc)

    # 第一遍：逐页提取文本
    page_texts: list[tuple[int, str]] = []
    for page_num in range(total_pages):
        page = doc[page_num]
        text = page.get_text("text").strip()
        if text:
            page_texts.append((page_num + 1, text))  # 页码从 1 开始

    doc.close()

    if not page_texts:
        logger.warning(f"PDF '{filename}' 无法提取文本（可能是扫描件）")
        return DocumentContext(
            doc_id=doc_id,
            filename=filename,
            total_pages=total_pages,
            chunks=[],
            full_text="",
        )

    # 第二遍：按段落分块，保留页码和章节标题信息
    chunks: list[DocumentChunk] = []
    current_heading = ""
    chunk_idx = 0
    full_text_parts: list[str] = []

    for page_num, page_text in page_texts:
        full_text_parts.append(page_text)
        paragraphs = page_text.split("\n\n")
        paragraphs = _merge_short_paragraphs(paragraphs)

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue

            # 检测是否为章节标题
            first_line = para.split("\n")[0]
            if _is_heading(first_line):
                current_heading = first_line.strip()

            # 超长段落切分
            if len(para) > _MAX_CHUNK_LENGTH:
                # 按句号分割后重新合并到合理长度
                sentences = re.split(r"(?<=[。！？.!?\n])", para)
                buffer = ""
                for sent in sentences:
                    if len(buffer) + len(sent) > _MAX_CHUNK_LENGTH and buffer:
                        chunk_idx += 1
                        chunks.append(
                            DocumentChunk(
                                chunk_id=f"chunk_{chunk_idx}",
                                content=buffer.strip(),
                                page_start=page_num,
                                page_end=page_num,
                                heading=current_heading,
                            )
                        )
                        buffer = sent
                    else:
                        buffer += sent
                if buffer.strip():
                    chunk_idx += 1
                    chunks.append(
                        DocumentChunk(
                            chunk_id=f"chunk_{chunk_idx}",
                            content=buffer.strip(),
                            page_start=page_num,
                            page_end=page_num,
                            heading=current_heading,
                        )
                    )
            else:
                chunk_idx += 1
                chunks.append(
                    DocumentChunk(
                        chunk_id=f"chunk_{chunk_idx}",
                        content=para,
                        page_start=page_num,
                        page_end=page_num,
                        heading=current_heading,
                    )
                )

    full_text = "\n\n".join(full_text_parts)

    # NOTE: 全文过长时截断，避免后续 prompt 超出 LLM 上下文窗口
    max_full_text = 50000
    if len(full_text) > max_full_text:
        full_text = full_text[:max_full_text] + "\n\n[... 文本已截断 ...]"

    logger.info(
        f"✅ PDF 解析完成: {total_pages} 页, {len(chunks)} 个分块, "
        f"全文 {len(full_text)} 字符"
    )

    return DocumentContext(
        doc_id=doc_id,
        filename=filename,
        total_pages=total_pages,
        chunks=chunks,
        full_text=full_text,
    )


def get_chunks_text(
    doc_context: DocumentContext, chunk_ids: list[str]
) -> str:
    """
    根据分块 ID 列表拼接对应的原文文本

    Args:
        doc_context: 文档上下文
        chunk_ids: 需要拼接的分块 ID 列表

    Returns:
        拼接后的原文文本，每个分块之间用分隔线分开
    """
    chunk_map = {c.chunk_id: c for c in doc_context.chunks}
    parts: list[str] = []

    for cid in chunk_ids:
        chunk = chunk_map.get(cid)
        if chunk:
            header = f"📄 第 {chunk.page_start} 页"
            if chunk.heading:
                header += f" | {chunk.heading}"
            parts.append(f"{header}\n{chunk.content}")

    return "\n\n---\n\n".join(parts)
