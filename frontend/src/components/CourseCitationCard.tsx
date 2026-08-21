import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import type { CourseCitation } from '../types';

interface CourseCitationCardProps {
  citation: CourseCitation;
  compact?: boolean;
}

export function CourseCitationCard({ citation, compact = false }: CourseCitationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const section = citation.section_path.join(' › ') || '未命名章节';

  return (
    <div className="course-citation">
      <button
        type="button"
        className="course-citation__header"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="course-citation__icon"><BookOpen size={14} /></span>
        <span className="min-w-0 flex-1 text-left">
          <span className="course-citation__eyebrow">教材依据</span>
          <span className="course-citation__title">{compact ? section : citation.document_title}</span>
          {!compact && <span className="course-citation__section">{section}</span>}
        </span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded && (
        <div className="course-citation__body">
          <p>{citation.excerpt}</p>
          <div className="course-citation__meta">
            {citation.source_file} · 第 {citation.line_start}–{citation.line_end} 行 · {citation.retrieval === 'hybrid' ? '混合检索' : '本地检索'}
          </div>
        </div>
      )}
    </div>
  );
}
