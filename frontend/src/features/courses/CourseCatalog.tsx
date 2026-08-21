import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Clock3,
  Database,
  GraduationCap,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-react';
import { courseApi } from '../../api/courses';
import { readableApiError } from '../../api/errors';
import type { Course, CourseIndexRecovery } from '../../types';
import {
  courseLevelLabel,
  getPrimaryRoleOrTags,
  resolveRecommendedCourseTitles,
} from './courseUtils';

interface CourseCatalogProps {
  onSelectCourse: (course: Course) => Promise<void>;
  recovery?: CourseIndexRecovery | null;
  onRecoveryHandled?: () => void;
}

interface CardMessage {
  kind: 'error' | 'info';
  text: string;
}

const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 120_000;

function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, POLL_INTERVAL_MS);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function indexSummary(course: Course): string {
  if (course.index.status === 'ready') return `${course.index.chunk_count} 个证据块`;
  if (course.index.status === 'building') return '知识库正在构建';
  if (course.index.status === 'stale') return '教材已更新，索引待重建';
  if (course.index.status === 'failed') return '上次构建失败';
  return '知识库待构建';
}

export function CourseCatalog({ onSelectCourse, recovery, onRecoveryHandled }: CourseCatalogProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [warnings, setWarnings] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pollingIds, setPollingIds] = useState<Set<string>>(() => new Set());
  const [enteringId, setEnteringId] = useState('');
  const [cardMessages, setCardMessages] = useState<Record<string, CardMessage>>({});
  const pollControllers = useRef(new Map<string, AbortController>());
  const enteringCourseId = useRef('');
  const mounted = useRef(true);

  const updateCourse = useCallback((course: Course) => {
    setCourses((previous) => previous.map((item) => item.id === course.id ? course : item));
  }, []);

  const setPolling = useCallback((courseId: string, active: boolean) => {
    setPollingIds((previous) => {
      const next = new Set(previous);
      if (active) next.add(courseId);
      else next.delete(courseId);
      return next;
    });
  }, []);

  const setCardMessage = useCallback((courseId: string, message?: CardMessage) => {
    setCardMessages((previous) => {
      const next = { ...previous };
      if (message) next[courseId] = message;
      else delete next[courseId];
      return next;
    });
  }, []);

  const cancelAllPolling = useCallback(() => {
    pollControllers.current.forEach((controller) => controller.abort());
    pollControllers.current.clear();
    if (mounted.current) setPollingIds(new Set());
  }, []);

  const enterCourse = useCallback(async (course: Course): Promise<boolean> => {
    // The ref closes the same-render double-click gap before React can commit
    // the disabled state to every card.
    if (enteringCourseId.current) return false;
    enteringCourseId.current = course.id;
    if (mounted.current) setEnteringId(course.id);
    setPolling(course.id, false);
    cancelAllPolling();
    try {
      onRecoveryHandled?.();
      await onSelectCourse(course);
      return true;
    } catch (entryError) {
      console.error(entryError);
      if (mounted.current) {
        setCardMessage(course.id, {
          kind: 'error',
          text: readableApiError(entryError, '进入课程失败，请重试。'),
        });
      }
      return false;
    } finally {
      if (enteringCourseId.current === course.id) enteringCourseId.current = '';
      if (mounted.current) setEnteringId('');
    }
  }, [cancelAllPolling, onRecoveryHandled, onSelectCourse, setCardMessage, setPolling]);

  const pollCourse = useCallback(async (courseId: string) => {
    pollControllers.current.get(courseId)?.abort();
    const controller = new AbortController();
    pollControllers.current.set(courseId, controller);
    setPolling(courseId, true);
    setCardMessage(courseId, { kind: 'info', text: '正在准备课程知识库，请稍候…' });
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    try {
      while (Date.now() < deadline) {
        await waitForPoll(controller.signal);
        const course = await courseApi.get(courseId, controller.signal);
        if (!mounted.current || controller.signal.aborted) return;
        updateCourse(course);
        if (course.index.status === 'ready') {
          setCardMessage(courseId);
          await enterCourse(course);
          return;
        }
        if (course.index.status === 'failed') {
          setCardMessage(courseId, {
            kind: 'error',
            text: course.index.message || '课程索引构建失败，请重试。',
          });
          return;
        }
      }
      setCardMessage(courseId, {
        kind: 'info',
        text: '索引仍在后台构建。已停止自动等待，请稍后刷新状态。',
      });
    } catch (pollError) {
      if (!controller.signal.aborted && mounted.current) {
        setCardMessage(courseId, {
          kind: 'error',
          text: readableApiError(pollError, '课程状态读取失败，请重试。'),
        });
      }
    } finally {
      if (pollControllers.current.get(courseId) === controller) {
        pollControllers.current.delete(courseId);
        if (mounted.current) setPolling(courseId, false);
      }
    }
  }, [enterCourse, setCardMessage, setPolling, updateCourse]);

  const loadCourses = useCallback(async () => {
    try {
      setError('');
      const response = await courseApi.list();
      if (!mounted.current) return;
      setCourses(response.courses);
      setWarnings(response.course_warnings);
    } catch (loadError) {
      console.error(loadError);
      if (mounted.current) setError('无法连接课程服务，请确认后端已启动。');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadCourses();
    return () => {
      mounted.current = false;
      cancelAllPolling();
    };
  }, [cancelAllPolling, loadCourses]);

  useEffect(() => {
    if (!recovery || loading) return;
    setCardMessage(recovery.courseId, { kind: 'error', text: recovery.message });
    window.requestAnimationFrame(() => {
      document.getElementById(`course-${recovery.courseId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [loading, recovery, setCardMessage]);

  const prepareCourse = async (course: Course) => {
    if (enteringCourseId.current) return;
    if (course.index.status === 'ready') {
      await enterCourse(course);
      return;
    }
    if (course.index.status === 'building') {
      await pollCourse(course.id);
      return;
    }
    try {
      setPolling(course.id, true);
      setCardMessage(course.id, { kind: 'info', text: '正在启动索引构建…' });
      const force = course.index.status === 'stale' || course.index.status === 'failed';
      const index = await courseApi.buildIndex(course.id, force);
      const updated = { ...course, index };
      updateCourse(updated);
      if (index.status === 'ready') {
        setCardMessage(course.id);
        await enterCourse(updated);
        return;
      }
      await pollCourse(course.id);
    } catch (buildError) {
      console.error(buildError);
      setCardMessage(course.id, {
        kind: 'error',
        text: readableApiError(buildError, '课程索引构建失败，请检查后端日志。'),
      });
    } finally {
      setPolling(course.id, false);
    }
  };

  const refreshCourse = async (course: Course) => {
    if (enteringCourseId.current) return;
    try {
      setPolling(course.id, true);
      const updated = await courseApi.get(course.id);
      updateCourse(updated);
      if (updated.index.status === 'ready') {
        setCardMessage(course.id);
        await enterCourse(updated);
      } else if (updated.index.status === 'failed') {
        setCardMessage(course.id, {
          kind: 'error',
          text: updated.index.message || '课程索引构建失败，请重试。',
        });
      } else if (updated.index.status === 'building') {
        await pollCourse(course.id);
      } else {
        setCardMessage(course.id, { kind: 'info', text: updated.index.message || '课程索引尚未就绪。' });
      }
    } catch (refreshError) {
      setCardMessage(course.id, {
        kind: 'error',
        text: readableApiError(refreshError, '课程状态刷新失败。'),
      });
    } finally {
      setPolling(course.id, false);
    }
  };

  if (loading) {
    return <div className="course-empty"><Loader2 className="animate-spin" /> 正在读取课程知识库…</div>;
  }

  if (error && courses.length === 0) {
    return (
      <div className="course-empty course-empty--error">
        <p>{error}</p>
        <button type="button" onClick={() => void loadCourses()}><RefreshCw size={14} /> 重新连接</button>
      </div>
    );
  }

  const warningCount = Object.values(warnings).reduce((total, items) => total + items.length, 0);

  return (
    <div className="course-catalog">
      {courses.map((course, index) => {
        const ready = course.index.status === 'ready';
        const polling = pollingIds.has(course.id);
        const entering = Boolean(enteringId);
        const enteringThisCourse = enteringId === course.id;
        const highlighted = recovery?.courseId === course.id;
        const recommendedTitles = resolveRecommendedCourseTitles(course, courses);
        const badges = getPrimaryRoleOrTags(course);
        const hasDetails = Boolean(
          course.prerequisite_skills.length || course.competencies.length || course.capstone,
        );
        const primaryLabel = ready
          ? '进入课程星图'
          : course.index.status === 'failed'
            ? '重试构建'
            : course.index.status === 'stale'
              ? '重建课程索引'
              : course.index.status === 'building'
                ? '查看构建进度'
                : '构建课程索引';

        return (
          <article
            id={`course-${course.id}`}
            className={`course-card${highlighted ? ' course-card--recovery' : ''}`}
            key={course.id}
            style={{ '--course-delay': `${index * 80}ms` } as CSSProperties}
          >
            <div className="course-card__constellation" aria-hidden="true">
              <span /><span /><span /><i /><i />
            </div>
            <div className="course-card__meta">
              <span>{course.category || course.track || '职业教育课程'}</span>
              <span>V{course.version}</span>
            </div>
            <div className="course-card__icon"><BookOpen size={24} /></div>
            <h3>{course.title}</h3>
            <p className="course-card__description">{course.description}</p>

            {(course.hours > 0 || course.level !== 'unspecified') && (
              <div className="course-card__facts">
                {course.hours > 0 && <span><Clock3 size={13} /> {course.hours} 学时</span>}
                {course.level !== 'unspecified' && <span><GraduationCap size={13} /> {courseLevelLabel(course.level)}</span>}
              </div>
            )}

            {badges.length > 0 && (
              <div className="course-card__badges" aria-label="岗位与课程标签">
                {badges.map((badge) => <span key={badge}>{badge}</span>)}
              </div>
            )}

            {recommendedTitles.length > 0 && (
              <p className="course-card__recommended">
                <strong>推荐先修：</strong>{recommendedTitles.join('、')}
              </p>
            )}

            {hasDetails && (
              <details className="course-card__details">
                <summary>查看岗位能力与实训目标</summary>
                <div>
                  {course.prerequisite_skills.length > 0 && (
                    <section><strong>先修能力</strong><p>{course.prerequisite_skills.join('、')}</p></section>
                  )}
                  {course.competencies.length > 0 && (
                    <section><strong>能力目标</strong><ul>{course.competencies.map((item) => <li key={item}>{item}</li>)}</ul></section>
                  )}
                  {course.capstone && <section><strong>综合项目</strong><p>{course.capstone}</p></section>}
                </div>
              </details>
            )}

            <div className="course-card__stats">
              <span><Database size={13} /> {indexSummary(course)}</span>
              <span>{course.materials.length} 份教材</span>
            </div>

            {cardMessages[course.id] && (
              <p className={`course-card__message course-card__message--${cardMessages[course.id].kind}`} role="status">
                {cardMessages[course.id].kind === 'error' && <AlertTriangle size={13} />}
                {cardMessages[course.id].text}
              </p>
            )}

            <div className="course-card__actions">
              <button type="button" onClick={() => void prepareCourse(course)} disabled={polling || entering}>
                {polling || enteringThisCourse ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                {enteringThisCourse ? '正在生成课程星图' : polling ? '正在检查索引' : primaryLabel}
              </button>
              {course.index.status === 'building' && !polling && (
                <button type="button" className="course-card__refresh" onClick={() => void refreshCourse(course)} disabled={entering}>
                  <RefreshCw size={14} /> 刷新状态
                </button>
              )}
            </div>
          </article>
        );
      })}
      {error && <p className="course-catalog__warning">{error}</p>}
      {warningCount > 0 && (
        <details className="course-catalog__maintenance">
          <summary>课程维护提示（{warningCount}）</summary>
          <ul>
            {Object.entries(warnings).flatMap(([courseId, items]) =>
              items.map((warning) => <li key={`${courseId}-${warning}`}>{courseId}：{warning}</li>),
            )}
          </ul>
        </details>
      )}
    </div>
  );
}
