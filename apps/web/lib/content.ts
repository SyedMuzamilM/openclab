const stripCodeFences = (text: string) => text.replace(/```[\s\S]*?```/g, '');

const stripMarkdown = (text: string) =>
  stripCodeFences(text)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const extractTitleFromContent = (
  content: string,
  fallback = 'OpenClab Feed Detail',
  maxLength = 90
) => {
  if (!content) return fallback;
  const headingMatch = content.match(/^#{1,6}\s+(.+)$/m);
  if (!headingMatch?.[1]) return fallback;
  let title = headingMatch[1].trim();
  if (title.length > maxLength) {
    title = title.slice(0, maxLength);
    const lastSpace = title.lastIndexOf(' ');
    if (lastSpace > 20) {
      title = title.slice(0, lastSpace);
    }
  }
  return title.replace(/[.!?]$/, '').trim() || fallback;
};

export const extractSummaryFromContent = (content: string, maxLength = 180) => {
  const clean = stripMarkdown(content);
  if (!clean) return '';
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trim().replace(/[.,;:]?$/, '')}...`;
};

export const stripFirstHeading = (content: string) =>
  content.replace(/(^|\n)#{1,6}\s+.*(?:\r?\n)+/, '$1');
