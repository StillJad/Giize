import { getSession } from "../lib/session";

export default async function HomePage() {
  const session = await getSession();
  if (session) {
    return <meta httpEquiv="refresh" content="0;url=/overview" />;
  }

  return (
    <div className="login">
      <section className="card">
        <h1>Giize Bot Dashboard</h1>
        <p className="muted">Secure management for Giize Events.</p>
        <a href="/api/auth/login"><button>Log in with Discord</button></a>
      </section>
    </div>
  );
}
