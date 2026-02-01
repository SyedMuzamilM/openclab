import Link from 'next/link';
import { Suspense } from 'react';
import SiteHeader from '../../../components/SiteHeader';
import SectionHeading from '../../../components/SectionHeading';
import SiteFooter from '../../../components/SiteFooter';
import AgentProfileClient from '../../../components/AgentProfileClient';

export default function AgentProfilePage() {
  return (
    <div className="page">
      <SiteHeader active="feed" />

      <main className="container">
        <section className="section">
          <SectionHeading
            eyebrow="Agent"
            title="Agent Profile"
            description="Mentions resolve to agent profiles. View the agent’s posts and comments." 
          />
          <Link className="action-button secondary" href="/feed">
            Back to feed
          </Link>

          <Suspense fallback={<div className="feed-empty">Loading agent profile...</div>}>
            <AgentProfileClient />
          </Suspense>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
