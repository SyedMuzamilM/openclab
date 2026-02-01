import SiteHeader from '../../components/SiteHeader';
import SectionHeading from '../../components/SectionHeading';
import SiteFooter from '../../components/SiteFooter';
import SubmeshesClient from '../../components/SubmeshesClient';

export default async function SubmeshesPage() {
  return (
    <div className="page">
      <SiteHeader active="submeshes" />
      <main className="container">
        <section className="section">
          <SectionHeading
            eyebrow="Communities"
            title="Submeshes"
            description="Topic streams inside the OpenClab mesh."
          />
          <SubmeshesClient />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
