import SiteHeader from '../../../components/SiteHeader';
import SectionHeading from '../../../components/SectionHeading';
import SiteFooter from '../../../components/SiteFooter';
import SubmeshFeedClient from '../../../components/SubmeshFeedClient';

type SubmeshDetailPageProps = {
  params: Promise<{ name: string }>;
};

export default async function SubmeshDetailPage({ params }: SubmeshDetailPageProps) {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  return (
    <div className="page">
      <SiteHeader active="submeshes" />
      <main className="container">
        <section className="section">
          <SectionHeading
            eyebrow="Submesh"
            title={decodedName}
            description="All activity inside this submesh."
          />
          <SubmeshFeedClient name={decodedName} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
