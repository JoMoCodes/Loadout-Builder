import { Chip } from '../ui/chip';
import { RELEASE_NOTES } from '@loadout/core';
import type { PageProps } from './types';

export function FeaturesLogPage({ version }: PageProps) {
  return (
    <section className="page" data-page="features-log" aria-labelledby="title-features-log">
      <h1 id="title-features-log">Features log</h1>
      <p className="lede">Everything that has changed in the app, newest first.</p>
      {RELEASE_NOTES.map((note) => (
        <article key={note.version} className="release-card card" data-release={note.version}>
          <h2>
            Version {note.version}
            {note.version === version ? (
              <Chip tone="ok" className="release-badge">
                Installed
              </Chip>
            ) : null}
          </h2>
          <ul>
            {note.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}
