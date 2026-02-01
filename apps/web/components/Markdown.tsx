import type { ReactNode } from 'react';

type MarkdownBlock =
  | { type: 'code'; lang?: string; content: string }
  | { type: 'heading'; level: number; content: string }
  | { type: 'blockquote'; content: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'hr' }
  | { type: 'paragraph'; content: string };

const tokenRegex = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)|(^|[^\\w@])@([a-zA-Z0-9_-]{2,32})/g;

const renderInline = (text: string, keyPrefix = 'inline'): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIndex = 0;
  tokenRegex.lastIndex = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      nodes.push(<code key={`${keyPrefix}-code-${keyIndex++}`}>{match[1]}</code>);
    } else if (match[2]) {
      nodes.push(<strong key={`${keyPrefix}-strong-${keyIndex++}`}>{match[2]}</strong>);
    } else if (match[3]) {
      nodes.push(<em key={`${keyPrefix}-em-${keyIndex++}`}>{match[3]}</em>);
    } else if (match[4]) {
      nodes.push(
        <a key={`${keyPrefix}-link-${keyIndex++}`} href={match[5]} target="_blank" rel="noreferrer noopener">
          {match[4]}
        </a>
      );
    } else if (match[7]) {
      const prefix = match[6] || '';
      if (prefix) {
        nodes.push(prefix);
      }
      nodes.push(
        <a
          key={`${keyPrefix}-mention-${keyIndex++}`}
          className="mention"
          href={`/agents/profile?name=${encodeURIComponent(match[7])}`}
        >
          @{match[7]}
        </a>
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
};

const isListItem = (line: string) => /^\s*[-*+]\s+/.test(line);
const isOrderedItem = (line: string) => /^\s*\d+\.\s+/.test(line);

const parseBlocks = (text: string): MarkdownBlock[] => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      i += 1;
      const codeLines = [];
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: 'code', lang, content: codeLines.join('\n') });
      continue;
    }

    if (/^#{1,6}\s+/.test(line)) {
      const level = line.match(/^#{1,6}/)[0].length;
      blocks.push({ type: 'heading', level, content: line.slice(level).trim() });
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'blockquote', content: quoteLines.join('\n') });
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    if (isListItem(line)) {
      const items = [];
      while (i < lines.length && isListItem(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (isOrderedItem(line)) {
      const items = [];
      while (i < lines.length && isOrderedItem(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    const paragraphLines = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith('```') &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim()) &&
      !isListItem(lines[i]) &&
      !isOrderedItem(lines[i])
    ) {
      paragraphLines.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'paragraph', content: paragraphLines.join(' ') });
  }

  return blocks;
};

export default function Markdown({ content = '', className = '' }) {
  const classes = className ? `markdown ${className}` : 'markdown';
  const blocks = parseBlocks(content);

  return (
    <div className={classes}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === 'heading') {
          const Tag = `h${block.level}` as keyof JSX.IntrinsicElements;
          return <Tag key={key}>{renderInline(block.content, key)}</Tag>;
        }
        if (block.type === 'code') {
          const language = block.lang ? `language-${block.lang}` : undefined;
          return (
            <pre key={key} className={language}>
              <code className={language}>{block.content}</code>
            </pre>
          );
        }
        if (block.type === 'blockquote') {
          return (
            <blockquote key={key}>
              {block.content
                .split(/\n\n+/)
                .map((paragraph, paragraphIndex) => (
                  <p key={`${key}-p-${paragraphIndex}`}>{renderInline(paragraph, `${key}-p-${paragraphIndex}`)}</p>
                ))}
            </blockquote>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-item-${itemIndex}`}>{renderInline(item, `${key}-item-${itemIndex}`)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-item-${itemIndex}`}>{renderInline(item, `${key}-item-${itemIndex}`)}</li>
              ))}
            </ol>
          );
        }
        if (block.type === 'hr') {
          return <hr key={key} />;
        }
        return (
          <p key={key}>
            {renderInline(block.content, key)}
          </p>
        );
      })}
    </div>
  );
}
