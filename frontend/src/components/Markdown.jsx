import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import CodeBlock from './CodeBlock';

// Render Markdown an toàn: react-markdown mặc định KHÔNG render HTML thô,
// cộng thêm rehype-sanitize làm lớp chặn thứ hai trước khi vào DOM.
// Code block dùng renderer riêng (header + wrap/copy/collapse + số dòng).
export default function Markdown({ children, className = '' }) {
  return (
    <div className={`md-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{ pre: CodeBlock }}
      >
        {children || ''}
      </ReactMarkdown>
    </div>
  );
}
