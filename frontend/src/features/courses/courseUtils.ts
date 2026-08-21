import type { Course, CourseLevel } from '../../types';

export function buildCourseCurrentLevel(course: Course): string {
  if (!course.prerequisite_skills.length) return '零基础';
  return `已具备：${course.prerequisite_skills.join('、')}`;
}

export function courseLevelLabel(level: CourseLevel): string {
  const labels: Record<CourseLevel, string> = {
    foundation: '基础',
    intermediate: '进阶',
    advanced: '高级',
    unspecified: '未标注',
  };
  return labels[level];
}

export function resolveRecommendedCourseTitles(course: Course, allCourses: Course[]): string[] {
  const titles = new Map(allCourses.map((item) => [item.id, item.title]));
  return course.recommended_courses.map((courseId) =>
    titles.get(courseId) || `${courseId}（暂未安装）`,
  );
}

/** Prefer explicit job roles, then fill the two compact badges with tags. */
export function getPrimaryRoleOrTags(course: Course): string[] {
  return [...new Set([...course.job_roles, ...course.tags])].slice(0, 2);
}
