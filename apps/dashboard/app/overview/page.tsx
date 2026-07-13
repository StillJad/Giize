import { botApi } from "../../lib/api";

type Overview = {
  health: { online: boolean; ping: number; uptime: number; processUptime: number; memory: { rss: number } };
  memberCount: number;
  verifiedJava: number;
  verifiedBedrock: number;
  openTickets: number;
  openEventApplications: number;
  activeEvents: number;
  automodEnabled: boolean;
  recentActivity: Record<string, unknown>;
};

export default async function OverviewPage() {
  const data = await botApi<Overview>("/overview");
  const metrics = [
    ["Bot status", data.health.online ? "Online" : "Offline"],
    ["Discord latency", `${data.health.ping}ms`],
    ["Bot uptime", `${Math.floor(data.health.uptime / 60)}m`],
    ["Process uptime", `${Math.floor(data.health.processUptime / 60)}m`],
    ["Memory usage", `${Math.round(data.health.memory.rss / 1024 / 1024)} MB`],
    ["Guild members", data.memberCount],
    ["Verified Java", data.verifiedJava],
    ["Verified Bedrock", data.verifiedBedrock],
    ["Open tickets", data.openTickets],
    ["Event applications", data.openEventApplications],
    ["Active events", data.activeEvents],
    ["AutoMod", data.automodEnabled ? "Enabled" : "Disabled"],
  ];

  return (
    <>
      <h1>Overview</h1>
      <div className="grid">
        {metrics.map(([label, value]) => (
          <section className="card" key={label}>
            <div className="muted">{label}</div>
            <div className="metric">{value}</div>
          </section>
        ))}
      </div>
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Recent Activity</h2>
        <pre className="muted">{JSON.stringify(data.recentActivity, null, 2)}</pre>
      </section>
    </>
  );
}
