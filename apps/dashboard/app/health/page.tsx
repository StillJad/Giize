import { botApi } from "../../lib/api";

export default async function HealthPage() {
  const data = await botApi<{
    online: boolean;
    loginUser: string | null;
    version: string;
    gitCommit: string | null;
    uptime: number;
    memory: { rss: number; heapUsed: number };
    ping: number;
    sqlite: boolean;
    hostname: string;
    startedAt: number;
    commandCount: number | null;
  }>("/health");
  const rows = [
    ["Bot online status", data.online ? "Online" : "Offline"],
    ["Login user", data.loginUser ?? "Unknown"],
    ["Version", data.version],
    ["Git commit", data.gitCommit ?? "Not available"],
    ["Uptime", `${Math.floor(data.uptime / 60)} minutes`],
    ["Memory usage", `${Math.round(data.memory.rss / 1024 / 1024)} MB RSS / ${Math.round(data.memory.heapUsed / 1024 / 1024)} MB heap`],
    ["Discord websocket ping", `${data.ping}ms`],
    ["SQLite status", data.sqlite ? "Connected" : "Unavailable"],
    ["Docker hostname", data.hostname],
    ["Last restart time", new Date(data.startedAt).toLocaleString()],
    ["Loaded command count", data.commandCount ?? "Unknown"],
  ];

  return (
    <>
      <h1>Bot Health</h1>
      <section className="card">
        <form>
          <button formAction="/health">Refresh Status</button>
        </form>
        <table className="table">
          <tbody>{rows.map(([label, value]) => <tr key={label}><th>{label}</th><td>{value}</td></tr>)}</tbody>
        </table>
      </section>
    </>
  );
}
