import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'katex/dist/katex.min.css';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

const components: Components = {
  ul: ({ node, ...props }) => {
    void node;
    return <ul className="list-disc pl-7 my-2 space-y-1" {...props} />;
  },
  ol: ({ node, ...props }) => {
    void node;
    return <ol className="list-decimal pl-7 my-2 space-y-1" {...props} />;
  },
  h1: ({ node, ...props }) => {
    void node;
    return <h1 className="text-xl font-bold mt-5 mb-2" {...props} />;
  },
  h2: ({ node, ...props }) => {
    void node;
    return <h2 className="text-lg font-bold mt-4 mb-2" {...props} />;
  },
  h3: ({ node, ...props }) => {
    void node;
    return <h3 className="text-base font-bold mt-3 mb-1" {...props} />;
  },
  a: ({ node, ...props }) => {
    void node;
    return <a className="text-primary underline underline-offset-4" target="_blank" rel="noopener noreferrer" {...props} />;
  },
  blockquote: ({ node, ...props }) => {
    void node;
    return <blockquote className="border-l-4 border-primary/40 pl-4 italic my-3 text-muted-foreground" {...props} />;
  },
  p: ({ node, ...props }) => {
    void node;
    return <p className="leading-7 mb-3 last:mb-0" {...props} />;
  },
  code: ({ node, className, children, ...props }) => {
    void node;
    const match = /language-(\w+)/.exec(className || '');
    if (match) {
      return (
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={match[1]}
          PreTag="div"
          customStyle={{ borderRadius: 2, border: '2px solid #171225', margin: '0.75rem 0' }}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      );
    }
    return (
      <code className={`${className ?? ''} bg-muted px-1.5 py-0.5 text-sm font-mono`} {...props}>
        {children}
      </code>
    );
  },
};

export function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  return (
    <div className={`ai-content min-w-0 break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
