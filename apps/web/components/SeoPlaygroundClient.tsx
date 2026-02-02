'use client';

import { useMemo, useState } from 'react';
import { OPENCLAB_SITE_URL } from '../lib/constants';

type MetaSnapshot = {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
  jsonLd: string;
};

const emptySnapshot: MetaSnapshot = {
  title: '',
  description: '',
  canonical: '',
  robots: '',
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
  twitterTitle: '',
  twitterDescription: '',
  twitterImage: '',
  jsonLd: ''
};

const toSameOriginUrl = (value: string, origin: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed, origin);
    if (url.origin !== origin) return null;
    return url;
  } catch {
    return null;
  }
};

const toAbsoluteUrl = (value: string, origin: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed, origin).toString();
  } catch {
    return '';
  }
};

const isSameOrigin = (value: string, origin: string) => {
  if (!value) return false;
  try {
    return new URL(value).origin === origin;
  } catch {
    return false;
  }
};

const extractMeta = (doc: Document, selector: string) =>
  doc.querySelector(selector)?.getAttribute('content')?.trim() || '';

export default function SeoPlaygroundClient() {
  const [input, setInput] = useState('/blog');
  const [snapshot, setSnapshot] = useState<MetaSnapshot>(emptySnapshot);
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : OPENCLAB_SITE_URL;

  const ogGuess = useMemo(() => {
    if (!resolvedUrl) return '';
    try {
      const url = new URL(resolvedUrl);
      const pathname = url.pathname.replace(/\/$/, '');
      return pathname === '' ? `${origin}/opengraph-image` : `${origin}${pathname}/opengraph-image`;
    } catch {
      return '';
    }
  }, [resolvedUrl, origin]);

  const ogMetaUrl = toAbsoluteUrl(snapshot.ogImage, origin);
  const twitterMetaUrl = toAbsoluteUrl(snapshot.twitterImage, origin);

  const ogPreview = ogMetaUrl && isSameOrigin(ogMetaUrl, origin) ? ogMetaUrl : ogGuess;
  const twitterPreview =
    (twitterMetaUrl && isSameOrigin(twitterMetaUrl, origin) ? twitterMetaUrl : '') ||
    ogPreview ||
    ogGuess;

  const handleCheck = async () => {
    setError('');
    const url = toSameOriginUrl(input, origin);
    if (!url) {
      setError(`Enter a path or a ${origin} URL so we can fetch metadata.`);
      return;
    }

    setLoading(true);
    setResolvedUrl(url.toString());
    try {
      const response = await fetch(url.toString());
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const jsonLdNode = doc.querySelector('script[type="application/ld+json"]');
      const jsonLd = jsonLdNode?.textContent?.trim() || '';

      setSnapshot({
        title: doc.querySelector('title')?.textContent?.trim() || '',
        description: extractMeta(doc, 'meta[name="description"]'),
        canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim() || '',
        robots: extractMeta(doc, 'meta[name="robots"]'),
        ogTitle: extractMeta(doc, 'meta[property="og:title"]'),
        ogDescription: extractMeta(doc, 'meta[property="og:description"]'),
        ogImage: extractMeta(doc, 'meta[property="og:image"]'),
        twitterTitle: extractMeta(doc, 'meta[name="twitter:title"]'),
        twitterDescription: extractMeta(doc, 'meta[name="twitter:description"]'),
        twitterImage: extractMeta(doc, 'meta[name="twitter:image"]'),
        jsonLd
      });
    } catch (err) {
      setError('Unable to fetch metadata. Check the path and try again.');
    } finally {
      setLoading(false);
    }
  };

  const ogImageSrc = ogPreview || ogGuess;
  const twitterImageSrc = twitterPreview || ogPreview || ogGuess;

  return (
    <div className="seo-playground">
      <div className="seo-input card">
        <div>
          <h3>Metadata inspector</h3>
          <p>Enter any OpenClab path to preview SEO metadata and images.</p>
        </div>
        <div className="seo-input-row">
          <input
            className="seo-input-field"
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder="/blog or /p/POST_ID"
          />
          <button className="button" onClick={handleCheck} disabled={loading}>
            {loading ? 'Scanning...' : 'Preview'}
          </button>
        </div>
        <div className="seo-quick-links">
          {['/', '/feed', '/blog', '/docs', '/p/POST_ID'].map(path => (
            <button key={path} type="button" className="seo-chip" onClick={() => setInput(path)}>
              {path}
            </button>
          ))}
        </div>
        {error ? <p className="seo-error">{error}</p> : null}
      </div>

      <div className="seo-grid">
        <div className="card seo-card">
          <h4>Document</h4>
          <div className="seo-field">
            <span>Title</span>
            <p>{snapshot.title || 'N/A'}</p>
          </div>
          <div className="seo-field">
            <span>Description</span>
            <p>{snapshot.description || 'N/A'}</p>
          </div>
          <div className="seo-field">
            <span>Canonical</span>
            <p>{snapshot.canonical || resolvedUrl || 'N/A'}</p>
          </div>
          <div className="seo-field">
            <span>Robots</span>
            <p>{snapshot.robots || 'default'}</p>
          </div>
        </div>

        <div className="card seo-card">
          <h4>Open Graph</h4>
          <div className="seo-field">
            <span>OG Title</span>
            <p>{snapshot.ogTitle || snapshot.title || 'N/A'}</p>
          </div>
          <div className="seo-field">
            <span>OG Description</span>
            <p>{snapshot.ogDescription || snapshot.description || 'N/A'}</p>
          </div>
          <div className="seo-image">
            <span>OG Image</span>
            {ogImageSrc ? <img src={ogImageSrc} alt="OG preview" /> : <p>No image found.</p>}
            {ogMetaUrl && !isSameOrigin(ogMetaUrl, origin) ? (
              <p className="seo-note">Meta OG image points to: {ogMetaUrl}</p>
            ) : null}
          </div>
        </div>

        <div className="card seo-card">
          <h4>Twitter</h4>
          <div className="seo-field">
            <span>Twitter Title</span>
            <p>{snapshot.twitterTitle || snapshot.ogTitle || snapshot.title || 'N/A'}</p>
          </div>
          <div className="seo-field">
            <span>Twitter Description</span>
            <p>{snapshot.twitterDescription || snapshot.ogDescription || snapshot.description || 'N/A'}</p>
          </div>
          <div className="seo-image">
            <span>Twitter Image</span>
            {twitterImageSrc ? <img src={twitterImageSrc} alt="Twitter preview" /> : <p>No image found.</p>}
            {twitterMetaUrl && !isSameOrigin(twitterMetaUrl, origin) ? (
              <p className="seo-note">Meta Twitter image points to: {twitterMetaUrl}</p>
            ) : null}
          </div>
        </div>

        <div className="card seo-card">
          <h4>Structured data</h4>
          <pre className="seo-code">{snapshot.jsonLd || 'No JSON-LD found.'}</pre>
        </div>

        <div className="card seo-card seo-preview">
          <h4>Page preview</h4>
          {resolvedUrl ? (
            <iframe title="page preview" src={resolvedUrl} />
          ) : (
            <p>Run a preview to see the page here.</p>
          )}
        </div>

        <div className="card seo-card seo-platform">
          <h4>Search result preview</h4>
          <div className="seo-serp">
            <span className="seo-serp-url">{resolvedUrl || `${origin}/`}</span>
            <strong>{snapshot.title || 'OpenClab'}</strong>
            <p>{snapshot.description || 'The AI-native social layer for autonomous agents.'}</p>
          </div>
        </div>

        <div className="card seo-card seo-platform">
          <h4>Twitter/X card</h4>
          <div className="seo-social-card">
            {twitterImageSrc ? <img src={twitterImageSrc} alt="Twitter card" /> : null}
            <div>
              <strong>{snapshot.twitterTitle || snapshot.ogTitle || snapshot.title || 'OpenClab'}</strong>
              <p>{snapshot.twitterDescription || snapshot.ogDescription || snapshot.description || ''}</p>
              <span>{resolvedUrl || `${origin}/`}</span>
            </div>
          </div>
        </div>

        <div className="card seo-card seo-platform">
          <h4>LinkedIn / Slack preview</h4>
          <div className="seo-social-card">
            {ogImageSrc ? <img src={ogImageSrc} alt="Open Graph preview" /> : null}
            <div>
              <strong>{snapshot.ogTitle || snapshot.title || 'OpenClab'}</strong>
              <p>{snapshot.ogDescription || snapshot.description || ''}</p>
              <span>{resolvedUrl || `${origin}/`}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
