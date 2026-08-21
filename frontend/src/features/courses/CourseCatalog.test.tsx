import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { courseApi, normalizeCourse, normalizeCourseIndex } from '../../api/courses';
import type { Course, CourseIndexState } from '../../types';
import { CourseCatalog } from './CourseCatalog';

function makeCourse(status: CourseIndexState = 'ready', extra: Record<string, unknown> = {}): Course {
  return normalizeCourse({
    id: 'agent-engineering',
    title: 'Agent 开发工程师',
    description: '面向真实岗位的代码工程课程',
    locale: 'zh-CN',
    version: '1.0',
    category: '人工智能应用',
    hours: 32,
    level: 'advanced',
    track: 'AI 应用工程',
    prerequisite_skills: ['Python', 'HTTP/JSON'],
    recommended_courses: ['llm-app-development'],
    job_roles: ['Agent 开发工程师'],
    competencies: ['实现可靠工具调用', '编排可中断工作流'],
    capstone: '职业学习助理 Agent',
    tags: ['MCP', '多智能体'],
    materials: [{ id: 'agent-loop', title: '执行循环', path: 'materials/01.md' }],
    index: {
      status,
      course_id: 'agent-engineering',
      chunk_count: status === 'ready' ? 42 : 0,
      message: status === 'failed' ? '索引文件损坏' : '',
    },
    ...extra,
  });
}

function mockList(courses: Course[]) {
  return vi.spyOn(courseApi, 'list').mockResolvedValue({
    courses,
    invalid_courses: {},
    course_warnings: {},
  });
}

afterEach(() => vi.useRealTimers());

describe('CourseCatalog', () => {
  it('renders vocational metadata and expandable details without empty legacy sections', async () => {
    const course = makeCourse();
    const prerequisite = normalizeCourse({ id: 'llm-app-development', title: '大模型应用开发' });
    mockList([course, prerequisite]);

    render(<CourseCatalog onSelectCourse={async () => undefined} />);

    expect(await screen.findByRole('heading', { name: 'Agent 开发工程师' })).toBeInTheDocument();
    expect(screen.getByText('32 学时')).toBeInTheDocument();
    expect(screen.getByText('高级')).toBeInTheDocument();
    expect(screen.getByText('推荐先修：').parentElement).toHaveTextContent('大模型应用开发');
    fireEvent.click(screen.getByText('查看岗位能力与实训目标'));
    expect(screen.getByText('实现可靠工具调用')).toBeInTheDocument();
    expect(screen.getByText('职业学习助理 Agent')).toBeInTheDocument();
    expect(screen.getAllByText('查看岗位能力与实训目标')).toHaveLength(1);
  });

  it('polls missing to ready every second and enters automatically', async () => {
    const missing = makeCourse('missing');
    const ready = makeCourse('ready');
    mockList([missing]);
    vi.spyOn(courseApi, 'buildIndex').mockResolvedValue(normalizeCourseIndex({
      status: 'building', course_id: missing.id,
    }));
    vi.spyOn(courseApi, 'get').mockResolvedValue(ready);
    const onSelectCourse = vi.fn();
    render(<CourseCatalog onSelectCourse={onSelectCourse} />);
    await screen.findByText('构建课程索引');

    vi.useFakeTimers();
    fireEvent.click(screen.getByText('构建课程索引'));
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(1_000));

    expect(onSelectCourse).toHaveBeenCalledWith(ready);
  });

  it('force-retries failed indexes and stops polling on a failed terminal state', async () => {
    const failed = makeCourse('failed');
    mockList([failed]);
    const build = vi.spyOn(courseApi, 'buildIndex').mockResolvedValue(normalizeCourseIndex({
      status: 'building', course_id: failed.id,
    }));
    vi.spyOn(courseApi, 'get').mockResolvedValue(makeCourse('failed', {
      index: { status: 'failed', course_id: failed.id, message: '教材格式错误' },
    }));
    render(<CourseCatalog onSelectCourse={async () => undefined} />);
    await screen.findByText('重试构建');

    vi.useFakeTimers();
    fireEvent.click(screen.getByText('重试构建'));
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(1_000));

    expect(build).toHaveBeenCalledWith(failed.id, true);
    expect(screen.getByText('教材格式错误')).toBeInTheDocument();
    expect(screen.getByText('重试构建')).not.toBeDisabled();
  });

  it('stops active polling after 120 seconds and offers manual status refresh', async () => {
    const missing = makeCourse('missing');
    const building = makeCourse('building');
    mockList([missing]);
    vi.spyOn(courseApi, 'buildIndex').mockResolvedValue(building.index);
    vi.spyOn(courseApi, 'get').mockResolvedValue(building);
    render(<CourseCatalog onSelectCourse={async () => undefined} />);
    await screen.findByText('构建课程索引');

    vi.useFakeTimers();
    fireEvent.click(screen.getByText('构建课程索引'));
    await act(async () => vi.advanceTimersByTimeAsync(120_000));

    expect(screen.getByText(/已停止自动等待/)).toBeInTheDocument();
    expect(screen.getByText('刷新状态')).toBeInTheDocument();
  });

  it('highlights recovery without rebuilding automatically', async () => {
    const stale = makeCourse('stale');
    mockList([stale]);
    const build = vi.spyOn(courseApi, 'buildIndex');
    const { container } = render(
      <CourseCatalog
        onSelectCourse={async () => undefined}
        recovery={{ courseId: stale.id, status: 'stale', message: '教材已更新，请重建索引' }}
      />,
    );

    expect(await screen.findByText('教材已更新，请重建索引')).toBeInTheDocument();
    expect(container.querySelector('.course-card--recovery')).toBeInTheDocument();
    expect(build).not.toHaveBeenCalled();
  });

  it('prevents a ready course from entering twice while graph generation is pending', async () => {
    const ready = makeCourse('ready');
    mockList([ready]);
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const onSelectCourse = vi.fn(() => pending);
    render(<CourseCatalog onSelectCourse={onSelectCourse} />);
    const button = await screen.findByRole('button', { name: '进入课程星图' });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(onSelectCourse).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    await act(async () => release?.());
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('blocks another ready course until the active course entry finishes', async () => {
    const first = makeCourse('ready');
    const second = makeCourse('ready', {
      id: 'rag-knowledge-engineering',
      title: 'RAG 知识库工程',
      index: { status: 'ready', course_id: 'rag-knowledge-engineering', chunk_count: 30 },
    });
    mockList([first, second]);
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const onSelectCourse = vi.fn(() => pending);
    render(<CourseCatalog onSelectCourse={onSelectCourse} />);
    const buttons = await screen.findAllByRole('button', { name: '进入课程星图' });

    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);

    expect(onSelectCourse).toHaveBeenCalledTimes(1);
    expect(onSelectCourse).toHaveBeenCalledWith(first);
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
    await act(async () => release?.());
    await waitFor(() => expect(buttons[1]).not.toBeDisabled());
  });
});
