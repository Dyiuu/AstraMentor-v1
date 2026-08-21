import { client } from './client';
import type {
  Course,
  CourseCitation,
  CourseIndexState,
  CourseIndexStatus,
  CourseLevel,
  CourseMaterial,
} from '../types';

export interface CourseListResponse {
  courses: Course[];
  invalid_courses: Record<string, string>;
  course_warnings: Record<string, string[]>;
}

export interface CourseSearchResult {
  score: number;
  rank: number;
  retrieval: string;
  citation: CourseCitation;
}

const COURSE_INDEX_STATES = new Set<CourseIndexState>(['ready', 'missing', 'stale', 'building', 'failed']);
const COURSE_LEVELS = new Set<CourseLevel>(['foundation', 'intermediate', 'advanced', 'unspecified']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
}

function normalizeMaterial(value: unknown): CourseMaterial | null {
  if (!isRecord(value)) return null;
  const path = text(value.path);
  const relativePath = text(value.relative_path, path);
  return {
    id: text(value.id),
    title: text(value.title),
    path,
    relative_path: relativePath,
  };
}

export function normalizeCourseIndex(value: unknown, courseId = ''): CourseIndexStatus {
  const wire = isRecord(value) ? value : {};
  const wireStatus = text(wire.status, 'missing');
  const status = COURSE_INDEX_STATES.has(wireStatus as CourseIndexState)
    ? wireStatus as CourseIndexState
    : 'missing';
  return {
    status,
    course_id: text(wire.course_id, courseId),
    chunk_count: nonNegativeInteger(wire.chunk_count, 0),
    message: text(wire.message),
    built_at: text(wire.built_at),
  };
}

/** Normalize old manifests once so every component sees safe, complete fields. */
export function normalizeCourse(value: unknown): Course {
  const wire = isRecord(value) ? value : {};
  const id = text(wire.id);
  const rawLevel = text(wire.level, 'unspecified');
  const level = COURSE_LEVELS.has(rawLevel as CourseLevel)
    ? rawLevel as CourseLevel
    : 'unspecified';
  return {
    id,
    title: text(wire.title),
    description: text(wire.description),
    locale: text(wire.locale, 'zh-CN'),
    version: text(wire.version, '1.0'),
    category: text(wire.category),
    order: nonNegativeInteger(wire.order, 999),
    hours: nonNegativeInteger(wire.hours, 0),
    level,
    track: text(wire.track),
    prerequisite_skills: stringList(wire.prerequisite_skills),
    recommended_courses: stringList(wire.recommended_courses),
    job_roles: stringList(wire.job_roles),
    competencies: stringList(wire.competencies),
    capstone: text(wire.capstone),
    tags: stringList(wire.tags),
    materials: Array.isArray(wire.materials)
      ? wire.materials.map(normalizeMaterial).filter((item): item is CourseMaterial => item !== null)
      : [],
    index: normalizeCourseIndex(wire.index, id),
  };
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function normalizeWarnings(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([courseId, warnings]) => [courseId, stringList(warnings)]),
  );
}

export const courseApi = {
  list: async (): Promise<CourseListResponse> => {
    const response = await client.get<unknown>('/courses');
    const data = isRecord(response.data) ? response.data : {};
    return {
      courses: Array.isArray(data.courses) ? data.courses.map(normalizeCourse) : [],
      invalid_courses: normalizeStringRecord(data.invalid_courses),
      course_warnings: normalizeWarnings(data.course_warnings),
    };
  },

  get: async (courseId: string, signal?: AbortSignal): Promise<Course> => {
    const response = await client.get<unknown>(`/courses/${courseId}`, { signal });
    return normalizeCourse(response.data);
  },

  buildIndex: async (courseId: string, force = false): Promise<Course['index']> => {
    const response = await client.post<unknown>(`/courses/${courseId}/index`, null, {
      params: { force },
    });
    return normalizeCourseIndex(response.data, courseId);
  },

  search: async (courseId: string, query: string, topK = 5) => {
    const response = await client.post<{ results: CourseSearchResult[] }>(
      `/courses/${courseId}/search`,
      { query, top_k: topK },
    );
    return response.data.results;
  },
};
