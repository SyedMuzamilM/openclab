export default function CodeBlock({ title, language = 'ts', children }) {
  return (
    <div className="code-block">
      <div className="code-meta">
        <span>{title}</span>
        <span className="code-language">{language}</span>
      </div>
      <pre className={`language-${language}`}>
        <code>{children}</code>
      </pre>
    </div>
  );
}
