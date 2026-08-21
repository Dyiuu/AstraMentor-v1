"""
文档模式独立 API 路由

挂载在 /api/doc 前缀下，与主题模式的 /api 路由完全独立。
通过注入文档上下文和专用提示词，复用现有 TeacherAgent 和 EvaluationAgent。
"""

import json
import logging
import uuid
from pathlib import Path
from typing import Dict, Any

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse

from services.pdf_parser import parse_pdf, DocumentContext, get_chunks_text
from services.learning_service import LearningService
from backend.api import build_streaming_response
from agents.doc_graph_agent import DocGraphAgent
from utils.api_client import APIClient
from services.streaming_service import encode_sse
from core.doc_prompts import (
    get_doc_teaching_prompt,
    get_doc_question_prompt,
    get_doc_evaluation_prompt,
    get_doc_teaching_plan_prompt,
)
from backend.models import (
    UploadDocumentResponse,
    GenerateDocGraphRequest,
    DocStartLearningRequest,
    DocChatRequest,
    DocEvaluateRequest,
    DocReteachRequest,
    TeachingContentResponse,
    EvaluationResponse,
    GroundingSource,
)

logger = logging.getLogger(__name__)

doc_router = APIRouter()

# NOTE: 内存缓存已解析的文档上下文，避免每次请求重新解析 PDF
# 生产环境应替换为 Redis 等外部缓存
_doc_cache: Dict[str, DocumentContext] = {}

# NOTE: 上传文件存储目录
_UPLOAD_DIR = Path("test_data") / "uploads"


def _get_doc_context(doc_id: str) -> DocumentContext:
    """从缓存获取文档上下文，不存在则尝试从磁盘加载"""
    if doc_id in _doc_cache:
        return _doc_cache[doc_id]

    # 尝试从磁盘加载
    context_file = _UPLOAD_DIR / f"{doc_id}_context.json"
    if context_file.exists():
        with open(context_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        doc_context = DocumentContext(**data)
        _doc_cache[doc_id] = doc_context
        return doc_context

    raise HTTPException(
        status_code=404,
        detail=f"文档 {doc_id} 未找到，请先上传 PDF 文件",
    )


def _get_node_source_text(doc_context: DocumentContext, node_name: str, graph_data: dict) -> str:
    """
    从图谱数据中找到节点对应的原文摘要

    NOTE: 优先使用 attributes.source_text，如果为空则根据 source_chunks 拼接
    """
    for node in graph_data.get("nodes", []):
        if node.get("name") == node_name:
            attrs = node.get("attributes", {})
            source_text = attrs.get("source_text", "")
            if source_text:
                return source_text

            # 使用 source_chunks 拼接原文
            chunk_ids = attrs.get("source_chunks", [])
            if chunk_ids:
                return get_chunks_text(doc_context, chunk_ids)

    # 回退：使用全文的前 2000 字符
    return doc_context.full_text[:2000] if doc_context.full_text else ""


def _get_doc_service(doc_id: str) -> LearningService:
    """为文档模式创建 LearningService 实例，使用 doc_id 作为 topic 隔离状态"""
    return LearningService(topic=f"doc_{doc_id}")


def _load_doc_graph(doc_id: str) -> dict | None:
    """从磁盘加载文档星图数据"""
    safe_id = f"doc_{doc_id}"
    graph_file = Path("test_data") / f"knowledge_graph_{safe_id}.json"
    if not graph_file.exists():
        return None
    try:
        with open(graph_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _prepare_doc_lesson(service: LearningService, kp, source_text: str, error_analysis: str = "") -> dict:
    """Build a current-step-only document lesson for the shared SSE transport."""
    prompt = get_doc_teaching_prompt(
        topic=kp.name,
        current_score=kp.actual_mastery,
        source_text=source_text,
    )
    plan_step = kp.get_current_plan_step()
    if plan_step:
        prompt += (
            f"\n\n【当前教学步骤】\n步骤名称：{plan_step.get('name', '')}"
            f"\n步骤内容：{plan_step.get('content', '')}"
            "\n必须只讲当前步骤，不得提前讲后续步骤。"
        )
    if error_analysis:
        prompt += f"\n\n【学生薄弱环节】\n{error_analysis}\n请换一种角度针对性重讲。"
    return {
        "prompt": prompt,
        "temperature": 0.7,
        "max_tokens": 2500,
        "current_step": kp.current_step,
        "total_steps": len(kp.teaching_plan),
        "is_plan_completed": kp.is_plan_completed(),
        "knowledge_scope": "document",
    }


# ============================================================================
# 文档上传
# ============================================================================

@doc_router.post("/upload", response_model=UploadDocumentResponse)
async def upload_document(file: UploadFile = File(...)):
    """
    上传 PDF 文件并解析

    Returns:
        doc_id、文件名、页数和分块数
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="仅支持 PDF 文件")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="上传的文件为空")

    # NOTE: 限制文件大小（50MB）
    max_size = 50 * 1024 * 1024
    if len(file_bytes) > max_size:
        raise HTTPException(status_code=400, detail="文件大小超过 50MB 限制")

    try:
        doc_context = parse_pdf(file_bytes, file.filename)
    except Exception as e:
        logger.error(f"PDF 解析失败: {e}")
        raise HTTPException(status_code=500, detail=f"PDF 解析失败: {str(e)}")

    if not doc_context.chunks:
        raise HTTPException(
            status_code=422,
            detail="无法从 PDF 中提取文本，可能是扫描件或图片型 PDF",
        )

    # 缓存到内存
    _doc_cache[doc_context.doc_id] = doc_context

    # 持久化到磁盘（JSON 格式保存上下文，方便后续加载）
    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    context_file = _UPLOAD_DIR / f"{doc_context.doc_id}_context.json"
    with open(context_file, "w", encoding="utf-8") as f:
        json.dump(doc_context.model_dump(), f, ensure_ascii=False, indent=2)

    # 同时保存原始 PDF 文件
    pdf_file = _UPLOAD_DIR / f"{doc_context.doc_id}.pdf"
    with open(pdf_file, "wb") as f:
        f.write(file_bytes)

    logger.info(f"✅ 文档上传成功: {file.filename} → doc_id={doc_context.doc_id}")

    return UploadDocumentResponse(
        doc_id=doc_context.doc_id,
        filename=doc_context.filename,
        total_pages=doc_context.total_pages,
        chunk_count=len(doc_context.chunks),
    )


# ============================================================================
# 文档星图生成
# ============================================================================

@doc_router.post("/graph/generate")
async def generate_doc_graph(request: GenerateDocGraphRequest):
    """基于文档内容生成知识星图"""
    doc_context = _get_doc_context(request.doc_id)

    api_client = APIClient()
    agent = DocGraphAgent(api_client=api_client)

    try:
        graph_data = agent.generate_knowledge_graph(
            doc_context=doc_context,
            complexity=request.complexity,
        )
    except Exception as e:
        logger.error(f"文档星图生成失败: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"文档星图生成失败: {str(e)}",
        )

    # 持久化到磁盘
    service = _get_doc_service(request.doc_id)
    service.save_graph(topic=f"doc_{request.doc_id}", graph_data=graph_data)

    return graph_data


# ============================================================================
# 文档模式教学
# ============================================================================

@doc_router.post("/learning/start")
async def doc_start_learning(request: DocStartLearningRequest):
    """文档模式：开始学习（生成教学计划）"""
    doc_context = _get_doc_context(request.doc_id)
    graph_data = _load_doc_graph(request.doc_id)
    source_text = _get_node_source_text(doc_context, request.node_name, graph_data or {})

    service = _get_doc_service(request.doc_id)

    # NOTE: 将原文上下文注入 user_note，使现有的 TeacherAgent 在生成计划时能参考原文
    doc_note = f"【文档模式 - 原文参考】\n{source_text}"
    if request.user_note:
        doc_note = f"{request.user_note}\n\n{doc_note}"

    plan = service.start_learning(
        node_name=request.node_name,
        node_description=request.node_description,
        user_note=doc_note,
        target_mastery=request.target_mastery,
        current_mastery=request.current_mastery,
        graph_data=graph_data,
    )
    return TeachingContentResponse(content=plan)


@doc_router.post("/learning/lesson")
async def doc_start_lesson(request: DocStartLearningRequest):
    """文档模式：开始讲课"""
    doc_context = _get_doc_context(request.doc_id)
    graph_data = _load_doc_graph(request.doc_id)
    source_text = _get_node_source_text(doc_context, request.node_name, graph_data or {})

    service = _get_doc_service(request.doc_id)
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")

    # NOTE: 使用文档模式专用提示词注入原文上下文
    from core.doc_prompts import get_doc_teaching_prompt
    doc_prompt = get_doc_teaching_prompt(
        topic=request.node_name,
        current_score=kp.actual_mastery,
        source_text=source_text,
    )
    plan_step = kp.get_current_plan_step()
    if plan_step:
        doc_prompt += (
            f"\n\n【当前教学步骤】\n步骤名称：{plan_step.get('name', '')}"
            f"\n步骤内容：{plan_step.get('content', '')}"
            "\n只讲当前步骤，不要提前讲后续步骤。"
        )

    # 通过 API 客户端直接生成教学内容（绕过 TeacherAgent 的默认提示词）
    result = service.api_client.generate(
        prompt=doc_prompt,
        temperature=0.7,
    )
    kp.record_completed_teaching(result)
    service.learner_state._auto_save()

    return TeachingContentResponse(
        content=result,
        sources=None,
        current_step=kp.current_step,
        total_steps=len(kp.teaching_plan) if kp.teaching_plan else 0,
        is_plan_completed=kp.is_plan_completed() if kp.teaching_plan else False,
    )


@doc_router.post("/learning/next-step")
async def doc_next_step(request: DocStartLearningRequest):
    """文档模式：推进到下一步"""
    doc_context = _get_doc_context(request.doc_id)
    graph_data = _load_doc_graph(request.doc_id)
    source_text = _get_node_source_text(doc_context, request.node_name, graph_data or {})

    service = _get_doc_service(request.doc_id)
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")

    kp.advance_step()
    service.learner_state._auto_save()

    if kp.is_plan_completed():
        return TeachingContentResponse(
            content="🎉 所有教学步骤已完成！恭喜你完成了本知识点的学习！",
            sources=None,
            current_step=kp.current_step,
            total_steps=len(kp.teaching_plan),
            is_plan_completed=True,
        )

    # 使用文档模式提示词讲解下一步
    doc_prompt = get_doc_teaching_prompt(
        topic=kp.name,
        current_score=kp.actual_mastery,
        source_text=source_text,
    )

    # 注入当前步骤信息
    plan_step = kp.get_current_plan_step()
    if plan_step:
        doc_prompt += f"\n\n【当前教学步骤】\n步骤名称：{plan_step.get('name', '')}\n步骤内容：{plan_step.get('content', '')}"

    result = service.api_client.generate(
        prompt=doc_prompt,
        temperature=0.7,
    )
    kp.record_completed_teaching(result)
    service.learner_state._auto_save()

    return TeachingContentResponse(
        content=result,
        sources=None,
        current_step=kp.current_step,
        total_steps=len(kp.teaching_plan),
        is_plan_completed=False,
    )


@doc_router.post("/learning/reteach")
async def doc_reteach(request: DocReteachRequest):
    """文档模式：根据错误重新讲解"""
    doc_context = _get_doc_context(request.doc_id)
    graph_data = _load_doc_graph(request.doc_id)
    source_text = _get_node_source_text(doc_context, request.node_name, graph_data or {})

    service = _get_doc_service(request.doc_id)
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")

    doc_prompt = get_doc_teaching_prompt(
        topic=kp.name,
        current_score=kp.actual_mastery,
        source_text=source_text,
    )

    plan_step = kp.get_current_plan_step()
    if plan_step:
        doc_prompt += (
            f"\n\n【当前教学步骤】\n步骤名称：{plan_step.get('name', '')}"
            f"\n步骤内容：{plan_step.get('content', '')}"
            "\n重新讲解也必须严格限定在当前步骤。"
        )

    if request.error_analysis:
        doc_prompt += f"\n\n【学生的薄弱环节】\n{request.error_analysis}\n\n请针对以上薄弱环节，结合文档原文重新讲解。"

    result = service.api_client.generate(
        prompt=doc_prompt,
        temperature=0.7,
    )
    kp.record_completed_teaching(result)
    service.learner_state._auto_save()

    return TeachingContentResponse(
        content=result,
        sources=None,
        current_step=kp.current_step,
        total_steps=len(kp.teaching_plan) if kp.teaching_plan else 0,
        is_plan_completed=kp.is_plan_completed() if kp.teaching_plan else False,
    )


# ============================================================================
# 文档模式出题与评估
# ============================================================================

@doc_router.post("/learning/question")
async def doc_generate_question(request: DocStartLearningRequest):
    """文档模式：基于文档内容出题"""
    doc_context = _get_doc_context(request.doc_id)
    graph_data = _load_doc_graph(request.doc_id)
    source_text = _get_node_source_text(doc_context, request.node_name, graph_data or {})

    service = _get_doc_service(request.doc_id)
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")

    plan_step = kp.get_current_plan_step()
    if plan_step and (
        not kp.last_teaching_content or kp.last_taught_step_index != kp.current_step
    ):
        raise HTTPException(
            status_code=409,
            detail={"code": "quiz_context_stale", "message": "请先完成当前步骤的讲解，再生成测验题。"},
        )

    doc_prompt = get_doc_question_prompt(
        topic=kp.name,
        current_score=kp.actual_mastery,
        source_text=source_text,
    )
    if plan_step:
        doc_prompt += f"""

【本次测验唯一范围】
步骤名称：{plan_step.get('name', '')}
步骤内容：{plan_step.get('content', '')}
刚刚完成的讲解：{kp.last_teaching_content}

只能考查当前步骤中刚刚实际讲过的内容，原文不得用于扩大测验范围。"""

    question = service.api_client.generate(
        prompt=doc_prompt,
        temperature=0.5,
    )

    question_id = uuid.uuid4().hex
    kp.active_question_id = question_id
    kp.active_question_text = question
    kp.active_question_step_index = kp.current_step
    kp.active_question_plan_version = kp.plan_version
    service.learner_state._auto_save()
    return {"question": question, "question_id": question_id}


@doc_router.post("/learning/evaluate")
async def doc_evaluate(request: DocEvaluateRequest):
    """文档模式：基于文档内容评估"""
    doc_context = _get_doc_context(request.doc_id)
    graph_data = _load_doc_graph(request.doc_id)
    source_text = _get_node_source_text(doc_context, request.node_name, graph_data or {})

    service = _get_doc_service(request.doc_id)
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")

    if request.question_id and (
        request.question_id != kp.active_question_id
        or kp.active_question_step_index != kp.current_step
        or kp.active_question_plan_version != kp.plan_version
        or request.question != kp.active_question_text
    ):
        raise HTTPException(
            status_code=409,
            detail={"code": "quiz_context_stale", "message": "题目与当前教学步骤不匹配，请重新生成。"},
        )

    # NOTE: 使用文档模式评分提示词，注入原文上下文
    doc_prompt = get_doc_evaluation_prompt(
        topic=kp.name,
        question=request.question,
        answer=request.answer,
        current_score=kp.actual_mastery,
        source_text=source_text,
    )

    # 直接调用 API 获取评分 JSON
    ai_result = service.api_client.generate_json(
        prompt=doc_prompt,
        temperature=0.3,
    )

    score = float(ai_result.get("score", 0.5))
    feedback = str(ai_result.get("feedback", "评估完成"))
    analysis = str(ai_result.get("analysis", ""))

    # 更新掌握度
    if kp.teaching_plan:
        step_idx = kp.current_step
        kp.record_step_score(step_idx, score)
        new_mastery = kp.calculate_weighted_mastery()
        kp.update_mastery(new_mastery, score, feedback)
    else:
        # 简单 EMA 更新
        alpha = 0.3
        new_mastery = kp.actual_mastery * (1 - alpha) + score * alpha
        kp.update_mastery(new_mastery, score, feedback)

    kp.clear_quiz_context()
    service.learner_state._auto_save()

    return EvaluationResponse(
        score=score,
        feedback=feedback,
        analysis=analysis,
        is_mastered=kp.is_mastered(),
        new_mastery=kp.actual_mastery,
    )


# ============================================================================
# 文档模式讨论
# ============================================================================

@doc_router.post("/learning/chat")
async def doc_chat(request: DocChatRequest):
    """文档模式：基于文档内容的自由讨论"""
    doc_context = _get_doc_context(request.doc_id)
    graph_data = _load_doc_graph(request.doc_id)
    source_text = _get_node_source_text(doc_context, request.node_name, graph_data or {})

    service = _get_doc_service(request.doc_id)
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")

    # NOTE: 将文档原文注入讨论上下文
    system_context = f"""你是一位学术文档导师，正在帮助学生理解文档内容。

当前讨论的知识点：{kp.name}

【文档原文参考】
{source_text}

请基于文档原文回答学生的问题，引用原文时使用 `> 原文` 格式。
如果问题超出文档内容范围，请明确告知学生并给出适当引导。
"""

    result = service.discuss(
        knowledge_point=kp,
        teaching_content=system_context,
        question=request.question,
        image=request.image,
        history=request.history,
    )

    return {
        "response": result["content"],
        "sources": result.get("sources", []),
    }


@doc_router.post("/learning/lesson/stream")
async def doc_start_lesson_stream(request: DocStartLearningRequest):
    doc_context = _get_doc_context(request.doc_id)
    graph_data = _load_doc_graph(request.doc_id)
    source_text = _get_node_source_text(doc_context, request.node_name, graph_data or {})
    service = _get_doc_service(request.doc_id)
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")
    return build_streaming_response(
        service,
        _prepare_doc_lesson(service, kp, source_text),
        knowledge_point=kp,
        commit_teaching=True,
    )


@doc_router.post("/learning/next-step/stream")
async def doc_next_step_stream(request: DocStartLearningRequest):
    doc_context = _get_doc_context(request.doc_id)
    graph_data = _load_doc_graph(request.doc_id)
    source_text = _get_node_source_text(doc_context, request.node_name, graph_data or {})
    service = _get_doc_service(request.doc_id)
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")
    kp.advance_step()
    service.learner_state._auto_save()
    if kp.is_plan_completed():
        meta = {"current_step": kp.current_step, "total_steps": len(kp.teaching_plan), "is_plan_completed": True}

        def completed_events():
            yield encode_sse("meta", meta)
            yield encode_sse("content_delta", {"type": "content_delta", "text": "🎉 所有教学步骤已完成！恭喜你完成了本知识点的学习！"})
            yield encode_sse("done", meta)

        return StreamingResponse(completed_events(), media_type="text/event-stream")
    return build_streaming_response(
        service,
        _prepare_doc_lesson(service, kp, source_text),
        knowledge_point=kp,
        commit_teaching=True,
    )


@doc_router.post("/learning/reteach/stream")
async def doc_reteach_stream(request: DocReteachRequest):
    doc_context = _get_doc_context(request.doc_id)
    graph_data = _load_doc_graph(request.doc_id)
    source_text = _get_node_source_text(doc_context, request.node_name, graph_data or {})
    service = _get_doc_service(request.doc_id)
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")
    return build_streaming_response(
        service,
        _prepare_doc_lesson(service, kp, source_text, request.error_analysis),
        knowledge_point=kp,
        commit_teaching=True,
    )


@doc_router.post("/learning/chat/stream")
async def doc_chat_stream(request: DocChatRequest):
    doc_context = _get_doc_context(request.doc_id)
    graph_data = _load_doc_graph(request.doc_id)
    source_text = _get_node_source_text(doc_context, request.node_name, graph_data or {})
    service = _get_doc_service(request.doc_id)
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")
    document_context = f"【文档原文参考】\n{source_text}\n请以文档原文为边界回答，超出范围时明确说明。"
    prepared = service.teacher.prepare_discuss_prompt(
        kp,
        teaching_content=document_context,
        question=request.question,
        discussion_history=request.history,
    )
    prepared["knowledge_scope"] = "document"
    return build_streaming_response(
        service,
        prepared,
        image=request.image,
        max_tokens=request.max_tokens,
        thinking=request.thinking,
    )


# ============================================================================
# 文档图谱管理
# ============================================================================

@doc_router.post("/graph/save")
async def doc_save_graph(request: GenerateDocGraphRequest):
    """保存文档模式星图（目前未使用，预留接口）"""
    # TODO: 实现图谱保存逻辑
    return {"status": "success"}


@doc_router.delete("/graph/delete")
async def doc_delete_graph(doc_id: str):
    """删除文档模式的星图和相关文件"""
    service = _get_doc_service(doc_id)
    service.delete_graph(topic=f"doc_{doc_id}")

    # 清理内存缓存
    _doc_cache.pop(doc_id, None)

    # 清理磁盘上的文档上下文和 PDF 文件
    context_file = _UPLOAD_DIR / f"{doc_id}_context.json"
    pdf_file = _UPLOAD_DIR / f"{doc_id}.pdf"
    for f in [context_file, pdf_file]:
        if f.exists():
            f.unlink()
            logger.info(f"已删除文件: {f}")

    return {"status": "success"}
