"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="card">
      <h1>Something went wrong</h1>
      <p className="muted">This dashboard page could not load. Please try again.</p>
      <button onClick={reset}>Try Again</button>
    </section>
  );
}
