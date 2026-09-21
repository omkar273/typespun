'use client';

import dynamic from 'next/dynamic';
import './playground.css';

/*
 * The playground is browser-only twice over: Monaco reaches for `self` and the
 * DOM at module scope, and the engine builds an in-memory `ts.Program`. There
 * is nothing useful to prerender, so this is the one place that says so.
 *
 * `ssr: false` is only legal inside a client component, which is the entire
 * reason this file exists between the route and the app.
 */
const Playground = dynamic(() => import('./app'), {
  ssr: false,
  loading: () => (
    <div className="tsp">
      <div className="shell">
        <div className="empty">
          <span className="spinner" />
          <strong>Loading the playground…</strong>
        </div>
      </div>
    </div>
  ),
});

export default function PlaygroundClient() {
  return <Playground />;
}
