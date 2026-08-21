import { describe, expect, it, vi } from 'vitest';
import { client } from './client';
import { courseApi, normalizeCourse } from './courses';
import {
  ApiRequestError,
  extractApiErrorDetail,
  getCourseIndexNotReadyDetail,
  getQuizContextStaleDetail,
} from './errors';

describe('course wire normalization', () => {
  it('supplies safe vocational metadata defaults for an old course', () => {
    const course = normalizeCourse({
      id: 'legacy-course',
      title: '旧课程',
      materials: [],
      index: { status: 'ready', course_id: 'legacy-course', chunk_count: 3 },
    });

    expect(course).toMatchObject({
      id: 'legacy-course',
      order: 999,
      hours: 0,
      level: 'unspecified',
      prerequisite_skills: [],
      recommended_courses: [],
      job_roles: [],
      competencies: [],
      capstone: '',
      tags: [],
    });
  });

  it('preserves the failed state and its displayable message', () => {
    const course = normalizeCourse({
      id: 'broken-course',
      title: '失败课程',
      materials: [],
      index: {
        status: 'failed',
        course_id: 'broken-course',
        chunk_count: 0,
        message: '教材无法读取',
      },
    });

    expect(course.index.status).toBe('failed');
    expect(course.index.message).toBe('教材无法读取');
  });

  it('accepts an old list response without course_warnings', async () => {
    vi.spyOn(client, 'get').mockResolvedValue({
      data: { courses: [{ id: 'one', title: '课程一', materials: [] }], invalid_courses: {} },
    });

    await expect(courseApi.list()).resolves.toMatchObject({
      course_warnings: {},
      courses: [{ id: 'one', level: 'unspecified' }],
    });
  });
});

describe('structured API errors', () => {
  it('unwraps a FastAPI 409 into a course index recovery detail', () => {
    const error = new ApiRequestError(409, {
      detail: {
        code: 'course_index_not_ready',
        course_id: 'agent-engineering',
        status: 'stale',
        message: '教材已更新',
      },
    });

    expect(error.status).toBe(409);
    expect(extractApiErrorDetail(error)).toMatchObject({ status: 'stale' });
    expect(getCourseIndexNotReadyDetail(error)).toEqual({
      code: 'course_index_not_ready',
      course_id: 'agent-engineering',
      status: 'stale',
      message: '教材已更新',
    });
  });

  it('does not misclassify quiz_context_stale as an index recovery', () => {
    const error = new ApiRequestError(409, {
      detail: { code: 'quiz_context_stale', message: '请重新出题' },
    });
    expect(getCourseIndexNotReadyDetail(error)).toBeNull();
    expect(getQuizContextStaleDetail(error)).toEqual({
      code: 'quiz_context_stale',
      message: '请重新出题',
    });
  });

  it('keeps a plain text server error readable', () => {
    const error = new ApiRequestError(500, 'upstream unavailable');
    expect(error.message).toBe('upstream unavailable');
  });
});
