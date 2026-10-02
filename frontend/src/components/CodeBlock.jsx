import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Code2, Copy, WrapText } from 'lucide-react';

// Lấy toàn bộ text bên trong node React (thường là <code>...</code> của Markdown)
function extractText(node) {
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node.props) return extractText(node.props.children);
  return '';
}

function formatBytes(n) {
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} Bytes`;
}

const iconBtn =
  'grid h-6 w-6 place-items-center rounded text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200';

// Code block kiểu HackerOne: header "Code · <size>" + wrap / copy / collapse, có số dòng.
// Dùng qua `components={{ pre: CodeBlock }}` của react-markdown — nội dung vẫn đã qua sanitize.
export default function CodeBlock({ children }) {
  const langMatch = /language-([\w-]+)/.exec(children?.props?.className || '');
  const lang = langMatch ? langMatch[1] : '';
  const raw = extractText(children).replace(/\n$/, '');
  const lines = raw.split('\n');
  const bytes = new TextEncoder().encode(raw).length;

  const [wrap, setWrap] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
    } catch {
      // Fallback cho trình duyệt chặn Clipboard API
      const ta = document.createElement('textarea');
      ta.value = raw;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* bỏ qua */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="md-code my-3 overflow-hidden rounded-md border border-zinc-800 bg-[#131316]">
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-[11px] text-zinc-500">
        <Code2 className="h-3.5 w-3.5" />
        <span className="font-semibold text-zinc-300">Code</span>
        {lang ? <span>· {lang}</span> : null}
        <span>· {formatBytes(bytes)}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            className={iconBtn}
            title={wrap ? 'Unwrap lines' : 'Wrap lines'}
            onClick={() => setWrap((w) => !w)}
          >
            <WrapText className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={iconBtn} title="Copy code" onClick={copy}>
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            className={iconBtn}
            title={collapsed ? 'Expand' : 'Collapse'}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {collapsed ? null : (
        <div className="flex max-h-[420px] overflow-auto text-[12px] leading-5">
          <div
            aria-hidden="true"
            className="select-none border-r border-zinc-800/80 bg-zinc-900/30 px-3 py-2 text-right font-mono text-zinc-600"
          >
            {lines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <div
            className={`min-w-0 flex-1 px-3 py-2 font-mono ${
              wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
            }`}
          >
            {lines.map((line, i) => (
              <div key={i}>{line || '\u00A0'}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
