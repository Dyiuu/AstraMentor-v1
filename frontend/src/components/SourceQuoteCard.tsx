import { FileText } from "lucide-react";

interface SourceQuoteCardProps {
  /** 原文引用内容 */
  sourceText: string;
  /** 页码范围（如 "第 3 页"） */
  pageInfo?: string;
  /** 章节标题 */
  heading?: string;
}

/**
 * 原文引用卡片组件
 *
 * NOTE: 文档模式下展示在教学内容旁，帮助用户对照原文理解知识点
 * 视觉上使用左侧紫色边框和浅色背景与教学内容区分
 */
export function SourceQuoteCard({ sourceText, pageInfo, heading }: SourceQuoteCardProps) {
  if (!sourceText) return null;

  return (
    <div className="my-3 rounded-lg border border-purple-500/30 bg-purple-500/5 overflow-hidden">
      {/* 卡片标题栏 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 border-b border-purple-500/20">
        <FileText className="h-3.5 w-3.5 text-purple-400" />
        <span className="text-xs font-medium text-purple-300">
          📄 文档原文
        </span>
        {pageInfo && (
          <span className="text-xs text-purple-400/60 ml-auto">
            {pageInfo}
          </span>
        )}
      </div>

      {/* 原文内容 */}
      <div className="px-3 py-2">
        {heading && (
          <p className="text-xs font-medium text-purple-300 mb-1">
            {heading}
          </p>
        )}
        <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">
          {sourceText.length > 500 ? sourceText.slice(0, 500) + '...' : sourceText}
        </p>
      </div>
    </div>
  );
}
