import unittest
from unittest.mock import Mock

from core.learner_state import KnowledgePoint
from services.learning_service import LearningService, QuizContextError


class QuizContextTests(unittest.TestCase):
    def make_service(self):
        service = LearningService.__new__(LearningService)
        service.teacher = Mock()
        service.teacher.generate_question.return_value = "当前步骤讲过的内容是什么？"
        service.evaluator = Mock()
        service.learner_state = Mock()
        service._course_evidence = Mock(return_value=("教材证据", []))
        return service

    def make_point(self):
        return KnowledgePoint(
            name="测试知识点",
            teaching_plan=[
                {"name": "步骤一", "content": "内容一", "verification": "问答"},
                {"name": "步骤二", "content": "内容二", "verification": "问答"},
            ],
            plan_version="plan-v1",
        )

    def test_quiz_requires_completed_current_lesson(self):
        service = self.make_service()
        with self.assertRaises(QuizContextError):
            service.generate_question(self.make_point())

    def test_question_is_bound_to_step_and_plan_version(self):
        service = self.make_service()
        point = self.make_point()
        point.record_completed_teaching("这里只讲了内容一")

        result = service.generate_question(point)

        self.assertEqual(result["question"], point.active_question_text)
        self.assertEqual(result["question_id"], point.active_question_id)
        self.assertEqual(point.active_question_step_index, 0)
        self.assertEqual(point.active_question_plan_version, "plan-v1")
        kwargs = service.teacher.generate_question.call_args.kwargs
        self.assertEqual(kwargs["plan_step"]["name"], "步骤一")
        self.assertEqual(kwargs["last_teaching_content"], "这里只讲了内容一")

    def test_advancing_step_invalidates_old_question(self):
        service = self.make_service()
        point = self.make_point()
        point.record_completed_teaching("内容一")
        question = service.generate_question(point)
        point.advance_step()

        with self.assertRaises(QuizContextError):
            service.evaluate_answer(
                point,
                question=question["question"],
                answer="回答",
                question_id=question["question_id"],
            )
        service.evaluator.evaluate.assert_not_called()


if __name__ == "__main__":
    unittest.main()
