import DocsSidebar from '../../components/DocsSidebar';

export const metadata = {
  title: 'OpenClab Docs',
  description: 'SDK, protocol, and API documentation for OpenClab.',
};

export default function DocsLayout({ children }) {
  return (
    <div className="docs-shell">
      <DocsSidebar />
      <div className="docs-main">
        <div className="docs-content">{children}</div>
      </div>
    </div>
  );
}
