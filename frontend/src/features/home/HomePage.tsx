import { ArrowRight, FileUp, Sparkles, History, Play, Trash2 } from 'lucide-react';
import type { Course, CourseIndexRecovery } from '../../types';
import type { GraphSession } from '../sidebar/HistorySidebar';
import { CourseCatalog } from '../courses/CourseCatalog';
import StarBackground from './StarBackground';

interface HomePageProps {
  onStart: () => void;
  onUploadDoc?: () => void;
  onSelectCourse: (course: Course) => Promise<void>;
  sessions: GraphSession[];
  onResumeSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  courseRecovery?: CourseIndexRecovery | null;
  onCourseRecoveryHandled?: () => void;
}

export default function HomePage({
  onStart,
  onUploadDoc,
  onSelectCourse,
  sessions,
  onResumeSession,
  onDeleteSession,
  courseRecovery,
  onCourseRecoveryHandled,
}: HomePageProps) {
  return (
    <div className="astra-home">
      <StarBackground />
      <header className="astra-home__header">
        <div className="astra-brand">
          <img src="/logo.png" alt="AstraMentor" />
          <div><strong>ASTRAMENTOR</strong><span>职业教育智能学习星图</span></div>
        </div>
        <div className="astra-home__status"><i /> LOCAL RAG READY</div>
      </header>

      <main className="astra-home__main">
        <div className="astra-home__content">
        <section className="astra-hero">
          <div className="astra-hero__copy">
            <div className="pixel-kicker"><Sparkles size={14} /> AI + 引导式学习</div>
            <h1>把职业课程<br /><em>变成可探索的星图</em></h1>
            <p>从教材出发生成知识路径。每次讲解、检测和进阶都有依据，让你看得见自己正在掌握什么。</p>
            <div className="astra-hero__actions">
              <button type="button" className="pixel-button pixel-button--primary" onClick={onStart}>
                自由探索 <ArrowRight size={16} />
              </button>
              {onUploadDoc && (
                <button type="button" className="pixel-button" onClick={onUploadDoc}>
                  <FileUp size={16} /> 上传资料
                </button>
              )}
            </div>
          </div>
          <div className="astra-hero__map" aria-hidden="true">
            <div className="map-grid" />
            <span className="hero-node hero-node--core">结构化<br />提示词</span>
            <span className="hero-node hero-node--one">智能体<br />概述</span>
            <span className="hero-node hero-node--two">知识库<br />调用</span>
            <span className="hero-node hero-node--three">插件<br />基础</span>
            <span className="hero-node hero-node--four">工作流<br />设计</span>
            <i className="hero-edge edge-one" /><i className="hero-edge edge-two" /><i className="hero-edge edge-three" /><i className="hero-edge edge-four" />
            <div className="hero-map__badge">A 0.62 / B 0.80</div>
          </div>
        </section>

        <section className="course-section">
          <div className="course-section__heading">
            <div><span className="section-index">01</span><h2>选择一门课程</h2></div>
            <p>教材优先 · 章节引用 · 本地可运行</p>
          </div>
          <CourseCatalog
            onSelectCourse={onSelectCourse}
            recovery={courseRecovery}
            onRecoveryHandled={onCourseRecoveryHandled}
          />
        </section>
        </div>

        <aside className="home-history" aria-label="历史学习">
          <div className="home-history__heading">
            <History size={17} />
            <div><strong>历史学习</strong><span>从上次进度继续</span></div>
          </div>
          <div className="home-history__list">
            {sessions.length === 0 ? (
              <div className="home-history__empty">完成一次星图学习后，记录会自动保存在这里。</div>
            ) : sessions.slice(0, 8).map((session) => (
              <article className="home-history__card" key={session.id}>
                <div className="home-history__meta">
                  <strong title={session.topic}>{session.topic}</strong>
                  <span>{new Date(session.date).toLocaleDateString('zh-CN')}</span>
                </div>
                <div className="home-history__progress">
                  <i style={{ width: `${Math.round((session.averageMastery || 0) * 100)}%` }} />
                </div>
                <div className="home-history__actions">
                  <span>{Math.round((session.averageMastery || 0) * 100)}%</span>
                  <button type="button" onClick={() => onResumeSession(session.id)}><Play size={12} />继续</button>
                  <button type="button" aria-label="删除历史记录" onClick={() => onDeleteSession(session.id)}><Trash2 size={12} /></button>
                </div>
              </article>
            ))}
          </div>
        </aside>
      </main>

      <footer className="astra-home__footer">
        <span>PLAN → TEACH → QUIZ → EVALUATE → NEXT</span>
        <span>ASTRAMENTOR MVP · 2026</span>
      </footer>
    </div>
  );
}
