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
  recentActivity: {
    latestTicketOpened: { creatorId: string | null; type: string | null; priority: string; openedAt: number | null } | null;
    latestEventApplication: { minecraft_username: string; status: string; created_at: number } | null;
    latestModerationAction: { user_id: string; moderator_id: string; created_at: number } | null;
    latestAutoModAction: { user_id: string; rule: string; created_at: number } | null;
  };
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
        <div className="activity-list">
          <Activity icon="🎟️" title="Latest ticket opened" description={data.recentActivity.latestTicketOpened ? `${data.recentActivity.latestTicketOpened.type ?? "Ticket"} · ${data.recentActivity.latestTicketOpened.priority}` : null} timestamp={data.recentActivity.latestTicketOpened?.openedAt ?? null} />
          <Activity icon="📝" title="Latest event application" description={data.recentActivity.latestEventApplication ? `${data.recentActivity.latestEventApplication.minecraft_username} · ${data.recentActivity.latestEventApplication.status}` : null} timestamp={data.recentActivity.latestEventApplication?.created_at ?? null} />
          <Activity icon="⚠️" title="Latest moderation action" description={data.recentActivity.latestModerationAction ? `Member ${data.recentActivity.latestModerationAction.user_id}` : null} timestamp={data.recentActivity.latestModerationAction?.created_at ?? null} />
          <Activity icon="🛡️" title="Latest AutoMod action" description={data.recentActivity.latestAutoModAction ? `${data.recentActivity.latestAutoModAction.rule} · ${data.recentActivity.latestAutoModAction.user_id}` : null} timestamp={data.recentActivity.latestAutoModAction?.created_at ?? null} />
        </div>
      </section>
    </>
  );
}

function Activity({ icon, title, description, timestamp }: { icon: string; title: string; description: string | null; timestamp: number | null }) {
  return (
    <div className="activity">
      <div className="activity-icon">{icon}</div>
      <div>
        <strong>{title}</strong>
        <p className="muted">{description ?? "No recent activity yet."}</p>
      </div>
      <span className="muted">{timestamp ? relativeTime(timestamp) : ""}</span>
    </div>
  );
}

function relativeTime(timestamp: number) {
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 60) return formatter.format(seconds, "second");
  if (abs < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
  return formatter.format(Math.round(seconds / 86400), "day");
}
