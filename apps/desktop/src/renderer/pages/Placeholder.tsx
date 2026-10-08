import type { PageId } from './types';

interface PlaceholderProps {
  pageId: PageId;
  title: string;
  /** What this page will do, in plain words. */
  willDo: string[];
}

/** A page that is not built yet. It says what will be here. Later versions replace it. */
export function Placeholder({ pageId, title, willDo }: PlaceholderProps) {
  return (
    <section className="page" data-page={pageId} aria-labelledby={`title-${pageId}`}>
      <h1 id={`title-${pageId}`}>{title}</h1>
      <div className="card">
        <p>This page is not ready yet. This is what it will do:</p>
        <ul>
          {willDo.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
