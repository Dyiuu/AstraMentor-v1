from fastapi import APIRouter, HTTPException, Depends
from services.learning_service import LearningService
from backend.models import (
    GenerateGraphRequest,
    StartLearningRequest,
    ChatRequest,
    EvaluateRequest,
    TeachingContentResponse,
    EvaluationResponse,
    UpdateNodeRequest,
    RunCodeRequest,
    RunCodeResponse,
    SaveGraphRequest,
    AddNodeRequest
)

from services.code_runner import CodeRunner

router = APIRouter()

# Dependency to get LearningService
def get_service():
    return LearningService()

@router.post("/run-code", response_model=RunCodeResponse)
async def run_code(request: RunCodeRequest):
    result = CodeRunner.run_code(request.language, request.code)
    return RunCodeResponse(**result)

@router.post("/graph/generate")
async def generate_graph(request: GenerateGraphRequest, service: LearningService = Depends(get_service)):
    graph = service.generate_knowledge_graph(
        topic=request.topic,
        learning_goal=request.learning_goal,
        current_level=request.current_level,
        target_level=request.target_level
    )
    if not graph:
        raise HTTPException(status_code=500, detail="Failed to generate knowledge graph")
    return graph

@router.post("/graph/save")
async def save_graph(request: SaveGraphRequest, service: LearningService = Depends(get_service)):
    """将修改后的图谱数据写回磁盘"""
    success = service.save_graph(topic=request.topic, graph_data=request.graph_data)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save graph")
    return {"status": "success"}

@router.post("/graph/expand")
async def expand_graph(request: AddNodeRequest, service: LearningService = Depends(get_service)):
    """
    在已有图谱上扩展新知识节点

    AI 会自动生成中间过渡节点并建立递进层次连接，
    合并后的完整图谱会同步持久化到磁盘。
    """
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

@router.get("/state")
async def get_state(service: LearningService = Depends(get_service)):
    return service.get_learner_state_summary()

@router.post("/learning/start")
async def start_learning(request: StartLearningRequest, service: LearningService = Depends(get_service)):
    # This now returns the Teaching Plan (str)
    plan = service.start_learning(
        node_name=request.node_name,
        node_description=request.node_description,
        user_note=request.user_note,
        target_mastery=request.target_mastery,
        current_mastery=request.current_mastery
    )
    return TeachingContentResponse(content=plan)

@router.post("/learning/lesson")
async def start_lesson(request: StartLearningRequest, service: LearningService = Depends(get_service)):
    # This returns the actual teaching content
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")
        
    content = service.teach(kp)
    return TeachingContentResponse(content=content)

@router.post("/learning/update")
async def update_learning(request: UpdateNodeRequest, service: LearningService = Depends(get_service)):
    service.update_knowledge_point(
        node_name=request.node_name,
        user_note=request.user_note,
        target_mastery=request.target_mastery,
        current_mastery=request.current_mastery
    )
    return {"status": "success", "message": "Knowledge point updated"}

@router.post("/learning/chat")
async def chat(request: ChatRequest, service: LearningService = Depends(get_service)):
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")
    
    # We don't have teaching_content in the request, looking at the service method:
    # discuss(knowledge_point, teaching_content, question, history)
    # The frontend might need to pass the teaching content context or we simplify.
    # For now, let's assume we can pass an empty string if it's just general discussion about the topic, 
    # OR we should update the model to include context.
    # Let's check TeacherAgent.discuss implementation later. 
    # Only passing "Context" if available.
    
    response = service.discuss(
        knowledge_point=kp,
        teaching_content="", # Context might be missing, but let's see if it works without
        question=request.question,
        image=request.image,
        history=request.history
    )
    return {"response": response}

@router.post("/learning/question")
async def generate_question(request: StartLearningRequest, service: LearningService = Depends(get_service)):
    # Reusing StartLearningRequest just for node_name
    kp = service.get_knowledge_point(request.node_name)
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")
    question = service.generate_question(kp)
    return {"question": question}

@router.post("/learning/evaluate")
async def evaluate(request: EvaluateRequest, service: LearningService = Depends(get_service)):
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
        new_mastery=evaluation.scoring_result.new_mastery if evaluation.scoring_result else kp.actual_mastery
    )
