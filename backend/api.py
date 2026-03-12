from fastapi import APIRouter, HTTPException
import json
from pathlib import Path
from services.learning_service import LearningService
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
    GroundingSource,
    GenerateProjectGraphRequest,
)

from services.code_runner import CodeRunner

router = APIRouter()


def get_service(topic: str = "") -> LearningService:
    """按 topic 创建 LearningService 实例，使学习状态按星图隔离"""
    return LearningService(topic=topic)


def load_graph_data(topic: str) -> dict | None:
    """从磁盘加载星图图谱数据，用于提取前置知识上下文"""
    if not topic:
        return None
    safe_topic = topic.replace(' ', '_').replace('/', '_')
    graph_file = Path("test_data") / f"knowledge_graph_{safe_topic}.json"
    if not graph_file.exists():
        return None
    try:
        with open(graph_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


@router.post("/run-code", response_model=RunCodeResponse)
async def run_code(request: RunCodeRequest):
    result = CodeRunner.run_code(request.language, request.code)
    return RunCodeResponse(**result)

@router.post("/graph/generate")
async def generate_graph(request: GenerateGraphRequest):
    service = get_service(request.topic)
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
    service = get_service(request.topic)
    success = service.save_graph(topic=request.topic, graph_data=request.graph_data)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save graph")
    return {"status": "success"}

@router.delete("/graph/delete")
async def delete_graph(topic: str):
    """删除星图对应的图谱文件和学习状态文件"""
    service = get_service(topic)
    service.delete_graph(topic=topic)
    return {"status": "success"}

@router.post("/graph/expand")
async def expand_graph(request: AddNodeRequest):
    """
    在已有图谱上扩展新知识节点

    AI 会自动生成中间过渡节点并建立递进层次连接，
    合并后的完整图谱会同步持久化到磁盘。
    """
    service = get_service(request.topic)
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to expand graph: {str(e)}")

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
    service = get_service(request.topic)
    # NOTE: 加载图谱数据，使教学计划生成时能考虑前置知识
    graph_data = load_graph_data(request.topic)
    plan = service.start_learning(
        node_name=request.node_name,
        node_description=request.node_description,
        user_note=request.user_note,
        target_mastery=request.target_mastery,
        current_mastery=request.current_mastery,
        graph_data=graph_data,
        project_description=request.project_description,
    )
    return TeachingContentResponse(content=plan)

@router.post("/learning/lesson")
async def start_lesson(request: StartLearningRequest):
    service = get_service(request.topic)
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
        current_step=kp.current_step,
        total_steps=len(kp.teaching_plan),
        is_plan_completed=kp.is_plan_completed(),
    )

@router.post("/learning/next-step")
async def next_step(request: StartLearningRequest):
    """推进到下一个教学步骤并自动讲解"""
    service = get_service(request.topic)
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
        current_step=result.get("current_step"),
        total_steps=result.get("total_steps"),
        is_plan_completed=result.get("is_plan_completed"),
    )

@router.post("/learning/reteach")
async def reteach(request: ReteachRequest):
    """根据错误分析重新讲解当前步骤"""
    service = get_service(request.topic)
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
        current_step=kp.current_step,
        total_steps=len(kp.teaching_plan),
        is_plan_completed=kp.is_plan_completed(),
    )

@router.post("/learning/update")
async def update_learning(request: UpdateNodeRequest):
    service = get_service(request.topic)
    service.update_knowledge_point(
        node_name=request.node_name,
        user_note=request.user_note,
        target_mastery=request.target_mastery,
        current_mastery=request.current_mastery
    )
    return {"status": "success", "message": "Knowledge point updated"}

@router.post("/learning/chat")
async def chat(request: ChatRequest):
    service = get_service(request.topic)
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
    }

@router.post("/learning/question")
async def generate_question(request: StartLearningRequest):
    service = get_service(request.topic)
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")
    question = service.generate_question(kp)
    return {"question": question}

@router.post("/learning/evaluate")
async def evaluate(request: EvaluateRequest):
    service = get_service(request.topic)
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")
        
    evaluation = service.evaluate_answer(
        knowledge_point=kp,
        question=request.question,
        answer=request.answer
    )
    
    feedback = service.get_progress_feedback(evaluation, kp)
    
    return EvaluationResponse(
        score=evaluation.score,
        feedback=feedback,
        analysis=evaluation.analysis,
        is_mastered=kp.is_mastered(),
        new_mastery=kp.actual_mastery
    )
