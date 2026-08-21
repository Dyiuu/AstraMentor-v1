import { describe, expect, it } from 'vitest';
import { normalizeCourse } from '../../api/courses';
import {
  buildCourseCurrentLevel,
  courseLevelLabel,
  getPrimaryRoleOrTags,
  resolveRecommendedCourseTitles,
} from './courseUtils';

describe('courseUtils', () => {
  it('builds a stable current level from prerequisite skills', () => {
    const course = normalizeCourse({
      id: 'agent-engineering',
      title: 'Agent 开发工程师',
      prerequisite_skills: ['Python', 'HTTP/JSON', 'Git/Linux'],
    });
    expect(buildCourseCurrentLevel(course)).toBe('已具备：Python、HTTP/JSON、Git/Linux');
    expect(buildCourseCurrentLevel(normalizeCourse({ id: 'legacy', title: '旧课程' }))).toBe('零基础');
  });

  it('maps recommended IDs in order and marks missing courses', () => {
    const course = normalizeCourse({
      id: 'agent-engineering',
      recommended_courses: ['llm-app-development', 'not-installed'],
    });
    const installed = normalizeCourse({ id: 'llm-app-development', title: '大模型应用开发' });
    expect(resolveRecommendedCourseTitles(course, [course, installed])).toEqual([
      '大模型应用开发',
      'not-installed（暂未安装）',
    ]);
  });

  it('prefers roles, fills with tags and limits compact badges to two', () => {
    const course = normalizeCourse({
      id: 'production',
      job_roles: ['AI 测试工程师'],
      tags: ['部署', '安全'],
    });
    expect(getPrimaryRoleOrTags(course)).toEqual(['AI 测试工程师', '部署']);
    expect(courseLevelLabel('advanced')).toBe('高级');
  });
});
