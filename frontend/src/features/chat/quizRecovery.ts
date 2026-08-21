import { getQuizContextStaleDetail } from '../../api/errors';

export interface QuizContextRecovery {
  currentQuestion: '';
  currentQuestionId: '';
  interactionState: 'step_taught';
  message: string;
}

/**
 * Translate the one recoverable quiz conflict into the exact UI state reset.
 * Other 409s intentionally return null so course-index recovery stays separate.
 */
export function resolveQuizContextRecovery(error: unknown): QuizContextRecovery | null {
  const detail = getQuizContextStaleDetail(error);
  if (!detail) return null;
  return {
    currentQuestion: '',
    currentQuestionId: '',
    interactionState: 'step_taught',
    message: detail.message,
  };
}
