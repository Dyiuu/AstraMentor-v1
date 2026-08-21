import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../api/errors';
import { resolveQuizContextRecovery } from './quizRecovery';

describe('resolveQuizContextRecovery', () => {
  it('clears the stale question and returns to the post-teaching state', () => {
    const error = new ApiRequestError(409, {
      detail: { code: 'quiz_context_stale', message: '课程内容已更新，请重新出题' },
    });

    expect(resolveQuizContextRecovery(error)).toEqual({
      currentQuestion: '',
      currentQuestionId: '',
      interactionState: 'step_taught',
      message: '课程内容已更新，请重新出题',
    });
  });

  it('does not route a course-index conflict through quiz recovery', () => {
    const error = new ApiRequestError(409, {
      detail: {
        code: 'course_index_not_ready',
        course_id: 'agent-engineering',
        status: 'stale',
        message: '课程索引已过期',
      },
    });

    expect(resolveQuizContextRecovery(error)).toBeNull();
  });

  it('ignores ordinary request failures', () => {
    expect(resolveQuizContextRecovery(new ApiRequestError(500, '服务暂不可用'))).toBeNull();
  });
});
