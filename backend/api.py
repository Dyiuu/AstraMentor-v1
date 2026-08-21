from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import uuid
from services.learning_service import LearningService, QuizContextError
from backend.course_runtime import course_runtime
from backend.models import (
    GenerateGraphRequest,
    StartLearningRequest,
    ChatRequest,
    EvaluateRequest,
    ReteachRequest,
    TeachingContentResponse,
    EvaluationResponse,
    UpdateNodeRequest,
    RunCodeRequest,
    RunCodeResponse,
    SaveGraphRequest,
    AddNodeRequest,
    CourseCitation,
    GroundingSource,
    GenerateProjectGraphRequest,
)

from services.code_runner import CodeRunner
from services.streaming_service import encode_sse
from rag.errors import CourseIndexNotReadyError

router = APIRouter()


def build_streaming_response(
    service: LearningService,
    prepared: dict,
    *,
    knowledge_point=None,
    image: str | None = None,
    max_tokens: int | None = None,
    thinking: bool = False,
    commit_teaching: bool = False,
) -> StreamingResponse:
    """Convert provider-neutral model deltas to a stable SSE contract."""
    request_id = uuid.uuid4().hex

    def events():
        full_content: list[str] = []
        try:
            yield encode_sse(
                "meta",
                {
                    "request_id": request_id,
                    "current_step": prepared.get("current_step"),
                    "total_steps": prepared.get("total_steps"),
                    "is_plan_completed": prepared.get("is_plan_completed"),
                    "knowledge_scope": prepared.get("knowledge_scope", "extension"),
                    "thinking_requested": thinking,
                },
            )
            for item in service.api_client.stream_generate(
                prompt=prepared["prompt"],
                image=image,
                system_instruction=prepared.get("system_instruction"),
                temperature=prepared.get("temperature", 0.5),
                max_tokens=max_tokens or prepared.get("max_tokens"),
                thinking=thinking,
            ):
                event_type = item.get("type", "content_delta")
                if event_type == "content_delta":
                    full_content.append(item.get("text", ""))
                yield encode_sse(event_type, item)

            content = "".join(full_content).strip()
            if commit_teaching and knowledge_point is not None and content:
                service.commit_streamed_teaching(knowledge_point, content)
            if prepared.get("citations"):
                yield encode_sse("citations", {"items": prepared["citations"]})
            if prepared.get("sources"):
                yield encode_sse("sources", {"items": prepared["sources"]})
            yield encode_sse(
                "done",
                {
                    "request_id": request_id,
                    "current_step": prepared.get("current_step"),
                    "total_steps": prepared.get("total_steps"),
                    "is_plan_completed": prepared.get("is_plan_completed"),
                },
            )
        except GeneratorExit:
            return
        except Exception as exc:
            yield encode_sse(
                "error",
                {"request_id": request_id, "message": str(exc)},
            )

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


def get_service(
    topic: str = "",
    course_id: str | None = None,
    *,
    require_course_index: bool = False,
) -> LearningService:
    """按 topic 创建 LearningService 实例，使学习状态按星图隔离"""
    if course_id:
        try:
            course_runtime.registry.get(course_id)
        except KeyError as exc:
            raise HTTPException(
                status_code=404,
                detail={"code": "course_not_found", "message": str(exc)},
            ) from exc
        if require_course_index:
            course_runtime.require_ready(course_id)
    return LearningService(topic=topic, course_id=course_id or "")


def load_graph_data(topic: str, course_id: str | None = None) -> dict | None:
    """从磁盘加载星图图谱数据，用于提取前置知识上下文"""
    if not topic:
        return None
    return get_service(topic, course_id).load_graph(topic)


@router.post("/run-code", response_model=RunCodeResponse)
async def run_code(request: RunCodeRequest):
    result = CodeRunner.run_code(request.language, request.code)
    return RunCodeResponse(**result)

@router.post("/graph/generate")
async def generate_graph(request: GenerateGraphRequest):
    service = get_service(
        request.topic, request.course_id, require_course_index=True
    )
    graph = service.generate_knowledge_graph(
        topic=request.topic,
        learning_goal=request.learning_goal,
        current_level=request.current_level,
        target_level=request.target_level,
        complexity=request.complexity,
    )
    if not graph:
        raise HTTPException(status_code=500, detail="Failed to generate knowledge graph")
    return graph

@router.post("/graph/save")
async def save_graph(request: SaveGraphRequest):
    service = get_service(request.topic, request.course_id)
    success = service.save_graph(topic=request.topic, graph_data=request.graph_data)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save graph")
    return {"status": "success"}

@router.delete("/graph/delete")
async def delete_graph(topic: str, course_id: str | None = None):
    """删除星图对应的图谱文件和学习状态文件"""
    service = get_service(topic, course_id)
    service.delete_graph(topic=topic)
    return {"status": "success"}

@router.post("/graph/expand")
async def expand_graph(request: AddNodeRequest):
    """
    在已有图谱上扩展新知识节点

    AI 会自动生成中间过渡节点并建立递进层次连接，
    合并后的完整图谱会同步持久化到磁盘。
    """
    service = get_service(
        request.topic, request.course_id, require_course_index=True
    )
    try:
        merged_graph = service.expand_graph(
            topic=request.topic,
            existing_graph_data=request.existing_graph,
            new_node_name=request.new_node_name,
            current_mastery=request.current_mastery,
            target_mastery=request.target_mastery,
            user_note=request.user_note,
        )
        return merged_graph
    except CourseIndexNotReadyError:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to expand graph: {str(e)}"
        ) from e

@router.post("/graph/generate-project")
async def generate_project_graph(request: GenerateProjectGraphRequest):
    """根据项目描述生成技能学习路径星图"""
    service = get_service(request.project_description[:50])
    graph = service.generate_project_graph(
        project_description=request.project_description,
        current_level=request.current_level,
        complexity=request.complexity,
    )
    if not graph:
        raise HTTPException(status_code=500, detail="Failed to generate project graph")
    return graph

@router.get("/state")
async def get_state():
    service = get_service()
    return service.get_learner_state_summary()

@router.post("/learning/start")
async def start_learning(request: StartLearningRequest):
    service = get_service(
        request.topic, request.course_id, require_course_index=True
    )
    # NOTE: 加载图谱数据，使教学计划生成时能考虑前置知识
    graph_data = service.load_graph(request.topic)
    plan = service.start_learning(
        node_name=request.node_name,
        node_description=request.node_description,
        user_note=request.user_note,
        target_mastery=request.target_mastery,
        current_mastery=request.current_mastery,
        graph_data=graph_data,
        project_description=request.project_description,
    )
    return TeachingContentResponse(
        content=plan,
        citations=[CourseCitation(**item) for item in service.last_citations],
        knowledge_scope=service.last_knowledge_scope,
    )

@router.post("/learning/lesson")
async def start_lesson(request: StartLearningRequest):
    service = get_service(
        request.topic, request.course_id, require_course_index=True
    )
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")

    # NOTE: teach() 返回 {"content": str, "sources": list} 字典
    result = service.teach(kp)
    sources = [
        GroundingSource(title=s.get("title", ""), url=s.get("url", ""))
        for s in result.get("sources", [])
    ]
    return TeachingContentResponse(
        content=result["content"],
        sources=sources if sources else None,
        citations=[CourseCitation(**item) for item in result.get("citations", [])],
        knowledge_scope=result.get("knowledge_scope", "extension"),
        current_step=kp.current_step,
        total_steps=len(kp.teaching_plan),
        is_plan_completed=kp.is_plan_completed(),
    )


@router.post("/learning/lesson/stream")
async def start_lesson_stream(request: StartLearningRequest):
    service = get_service(
        request.topic, request.course_id, require_course_index=True
    )
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")
    prepared = service.prepare_lesson_stream(
        kp, project_description=request.project_description
    )
    return build_streaming_response(
        service, prepared, knowledge_point=kp, commit_teaching=True
    )

@router.post("/learning/next-step")
async def next_step(request: StartLearningRequest):
    """推进到下一个教学步骤并自动讲解"""
    service = get_service(
        request.topic, request.course_id, require_course_index=True
    )
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")

    result = service.advance_and_teach(kp)
    sources = [
        GroundingSource(title=s.get("title", ""), url=s.get("url", ""))
        for s in result.get("sources", [])
    ]
    return TeachingContentResponse(
        content=result["content"],
        sources=sources if sources else None,
        citations=[CourseCitation(**item) for item in result.get("citations", [])],
        knowledge_scope=result.get("knowledge_scope", "extension"),
        current_step=result.get("current_step"),
        total_steps=result.get("total_steps"),
        is_plan_completed=result.get("is_plan_completed"),
    )


@router.post("/learning/next-step/stream")
async def next_step_stream(request: StartLearningRequest):
    service = get_service(
        request.topic, request.course_id, require_course_index=True
    )
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")
    kp.advance_step()
    service.learner_state._auto_save()
    if kp.is_plan_completed():
        prepared = {
            "prompt": "",
            "current_step": kp.current_step,
            "total_steps": len(kp.teaching_plan),
            "is_plan_completed": True,
        }

        def completed_events():
            yield encode_sse("meta", prepared)
            yield encode_sse(
                "content_delta",
                {"type": "content_delta", "text": "🎉 所有教学步骤已完成！恭喜你完成了本知识点的学习！"},
            )
            yield encode_sse("done", prepared)

        return StreamingResponse(completed_events(), media_type="text/event-stream")
    prepared = service.prepare_lesson_stream(
        kp, project_description=request.project_description
    )
    return build_streaming_response(
        service, prepared, knowledge_point=kp, commit_teaching=True
    )

@router.post("/learning/reteach")
async def reteach(request: ReteachRequest):
    """根据错误分析重新讲解当前步骤"""
    service = get_service(
        request.topic, request.course_id, require_course_index=True
    )
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")

    result = service.reteach_step(kp, error_analysis=request.error_analysis,
                                  project_description=request.project_description)
    sources = [
        GroundingSource(title=s.get("title", ""), url=s.get("url", ""))
        for s in result.get("sources", [])
    ]
    return TeachingContentResponse(
        content=result["content"],
        sources=sources if sources else None,
        citations=[CourseCitation(**item) for item in result.get("citations", [])],
        knowledge_scope=result.get("knowledge_scope", "extension"),
        current_step=kp.current_step,
        total_steps=len(kp.teaching_plan),
        is_plan_completed=kp.is_plan_completed(),
    )


@router.post("/learning/reteach/stream")
async def reteach_stream(request: ReteachRequest):
    service = get_service(
        request.topic, request.course_id, require_course_index=True
    )
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")
    prepared = service.prepare_lesson_stream(
        kp,
        project_description=request.project_description,
        error_analysis=request.error_analysis,
    )
    return build_streaming_response(
        service, prepared, knowledge_point=kp, commit_teaching=True
    )

@router.post("/learning/update")
async def update_learning(request: UpdateNodeRequest):
    service = get_service(request.topic, request.course_id)
    service.update_knowledge_point(
        node_name=request.node_name,
        user_note=request.user_note,
        target_mastery=request.target_mastery,
        current_mastery=request.current_mastery
    )
    return {"status": "success", "message": "Knowledge point updated"}

@router.post("/learning/chat")
async def chat(request: ChatRequest):
    service = get_service(
        request.topic, request.course_id, require_course_index=True
    )
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")
    
    # NOTE: discuss() 现在返回 {"content": str, "sources": list} 字典
    result = service.discuss(
        knowledge_point=kp,
        teaching_content="",
        question=request.question,
        image=request.image,
        history=request.history,
        project_description=request.project_description,
    )
    return {
        "response": result["content"],
        "sources": result.get("sources", []),
        "citations": result.get("citations", []),
        "knowledge_scope": result.get("knowledge_scope", "extension"),
    }


@router.post("/learning/chat/stream")
async def chat_stream(request: ChatRequest):
    service = get_service(
        request.topic, request.course_id, require_course_index=True
    )
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")
    prepared = service.prepare_discussion_stream(
        kp,
        question=request.question,
        history=request.history,
        project_description=request.project_description,
    )
    return build_streaming_response(
        service,
        prepared,
        image=request.image,
        max_tokens=request.max_tokens,
        thinking=request.thinking,
    )

@router.post("/learning/question")
async def generate_question(request: StartLearningRequest):
    service = get_service(
        request.topic, request.course_id, require_course_index=True
    )
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")
    try:
        result = service.generate_question(kp)
    except QuizContextError as exc:
        raise HTTPException(status_code=409, detail={"code": "quiz_context_stale", "message": str(exc)})
    return {
        "question": result["question"],
        "question_id": result["question_id"],
        "citations": service.last_citations,
        "knowledge_scope": service.last_knowledge_scope,
    }

@router.post("/learning/evaluate")
async def evaluate(request: EvaluateRequest):
    service = get_service(
        request.topic, request.course_id, require_course_index=True
    )
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")
        
    try:
        evaluation = service.evaluate_answer(
            knowledge_point=kp,
            question=request.question,
            answer=request.answer,
            question_id=request.question_id,
        )
    except QuizContextError as exc:
        raise HTTPException(status_code=409, detail={"code": "quiz_context_stale", "message": str(exc)})
    
    feedback = service.get_progress_feedback(evaluation, kp)
    
    return EvaluationResponse(
        score=evaluation.score,
        feedback=feedback,
        analysis=evaluation.analysis,
        is_mastered=kp.is_mastered(),
        new_mastery=kp.actual_mastery,
        citations=[CourseCitation(**item) for item in service.last_citations],
        knowledge_scope=service.last_knowledge_scope,
        question_id=request.question_id,
    )
