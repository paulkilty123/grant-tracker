'use client'

// Design-system markdown renderer for Companion assistant output (drawer +
// setup conversation). The model emits bold, lists, and tables in its natural
// output; before this they rendered raw ("**", broken pipes). Element renderers
// map to the design system: Space Grotesk headings/table headers, forest
// links, cream code/table chrome, rounded corners (never border-radius 0), and
// tables that scroll inside their own overflow-x container so a wide table
// never pushes the chat bubble sideways.

import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const grotesk = { fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }

const COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline" style={{ color: '#3B6D11' }}>{children}</a>
  ),
  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h3 className="text-base font-bold mt-2 mb-1" style={grotesk}>{children}</h3>,
  h2: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1" style={grotesk}>{children}</h3>,
  h3: ({ children }) => <h4 className="text-sm font-semibold mt-2 mb-1" style={grotesk}>{children}</h4>,
  blockquote: ({ children }) => (
    <blockquote className="pl-3 my-2" style={{ borderLeft: '3px solid #DCE8C8', color: '#5F5E5A' }}>{children}</blockquote>
  ),
  hr: () => <hr className="my-2" style={{ border: 0, borderTop: '1px solid #E9E6DD' }} />,
  code: ({ children }) => (
    <code className="px-1 py-0.5 text-[12px]" style={{ background: '#F5F1E8', borderRadius: 6, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto my-2 p-2.5 text-[12px]" style={{ background: '#F5F1E8', borderRadius: 8 }}>{children}</pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="text-[13px]" style={{ borderCollapse: 'collapse', borderRadius: 8, overflow: 'hidden' }}>{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="text-left px-2 py-1 font-semibold" style={{ ...grotesk, background: '#F5F1E8', border: '1px solid #E9E6DD', color: '#2C2C2A' }}>{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-2 py-1 align-top" style={{ border: '1px solid #E9E6DD' }}>{children}</td>
  ),
}

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed" style={{ color: '#2C2C2A' }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>{children}</ReactMarkdown>
    </div>
  )
}
