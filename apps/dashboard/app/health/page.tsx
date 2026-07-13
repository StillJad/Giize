import { botApi } from "../../lib/api";

export default async function HealthPage() {
  const data = await botApi<Record<string, unknown>>("/health");

  return (
    <>
      <h1>Bot Health</h1>
      <section className="card">
        <form>
          <button formAction="/health">Refresh Status</button>
        </form>
        <pre className="muted">{JSON.stringify(data, null, 2)}</pre>
      </section>
    </>
  );
}
