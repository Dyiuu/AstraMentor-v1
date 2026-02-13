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
    RunCodeResponse
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
