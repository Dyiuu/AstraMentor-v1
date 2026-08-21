import type {
  CourseIndexNotReadyDetail,
  CourseIndexState,
  QuizContextStaleDetail,
} from '../types';

const COURSE_INDEX_STATES = new Set<CourseIndexState>([
  'ready',
  'missing',
  'stale',
  'building',
  'failed',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapFastApiDetail(payload: unknown): unknown {
  if (isRecord(payload) && 'detail' in payload) return payload.detail;
  return payload;
}

function errorMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (isRecord(detail) && typeof detail.message === 'string' && detail.message.trim()) {
    return detail.message;
  }
  return fallback;
}

/** Error shared by Axios and fetch so callers can inspect one stable shape. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, payload: unknown, fallback = `HTTP ${status}`) {
    const detail = unwrapFastApiDetail(payload);
    super(errorMessage(detail, fallback));
    this.name = 'ApiRequestError';
    this.status = status;
    this.detail = detail;
  }
}

/** Return the FastAPI detail object from either an ApiRequestError or wire payload. */
export function extractApiErrorDetail(value: unknown): unknown {
  if (value instanceof ApiRequestError) return value.detail;
  if (isRecord(value) && isRecord(value.response) && 'data' in value.response) {
    return unwrapFastApiDetail(value.response.data);
  }
  return unwrapFastApiDetail(value);
}

/** Convert Axios-like failures without coupling the error helper to Axios itself. */
export function toApiRequestError(value: unknown): Error {
  if (value instanceof ApiRequestError) return value;
  if (isRecord(value) && isRecord(value.response)) {
    const status = value.response.status;
    if (typeof status === 'number') {
      const payload = value.response.data;
      const fallback = value instanceof Error ? value.message : `HTTP ${status}`;
      return new ApiRequestError(status, payload, fallback);
    }
  }
  if (value instanceof Error) return value;
  return new Error(String(value || '请求失败'));
}

export function getCourseIndexNotReadyDetail(value: unknown): CourseIndexNotReadyDetail | null {
  const detail = extractApiErrorDetail(value);
  if (!isRecord(detail) || detail.code !== 'course_index_not_ready') return null;
  if (typeof detail.course_id !== 'string' || !detail.course_id) return null;
  if (typeof detail.status !== 'string' || !COURSE_INDEX_STATES.has(detail.status as CourseIndexState)) {
    return null;
  }
  return {
    code: 'course_index_not_ready',
    course_id: detail.course_id,
    status: detail.status as CourseIndexState,
    message: typeof detail.message === 'string' && detail.message
      ? detail.message
      : '课程索引尚未就绪',
  };
}

export function getQuizContextStaleDetail(value: unknown): QuizContextStaleDetail | null {
  const detail = extractApiErrorDetail(value);
  if (!isRecord(detail) || detail.code !== 'quiz_context_stale') return null;
  return {
    code: 'quiz_context_stale',
    message: typeof detail.message === 'string' && detail.message.trim()
      ? detail.message
      : '题目上下文已失效，请重新出题。',
  };
}

export function readableApiError(value: unknown, fallback: string): string {
  const normalized = toApiRequestError(value);
  return normalized.message || fallback;
}
