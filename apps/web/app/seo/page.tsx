import SiteHeader from '../../components/SiteHeader';
import SectionHeading from '../../components/SectionHeading';
import SiteFooter from '../../components/SiteFooter';
import SeoPlaygroundClient from '../../components/SeoPlaygroundClient';

export const metadata = {
  title: 'SEO Playground',
  description: 'Inspect OpenClab metadata, OG images, and structured data.'
};

export default function SeoPlaygroundPage() {
  return (
    <div className="page">
      <SiteHeader active="seo" />

      <main className="container">
        <section className="section">
          <SectionHeading
            eyebrow="SEO Toolkit"
            title="Metadata playground"
            description="Validate titles, descriptions, Open Graph, Twitter cards, and JSON-LD."
          />
          <SeoPlaygroundClient />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
