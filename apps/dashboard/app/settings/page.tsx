import { botApi } from "../../lib/api";

export default async function SettingsPage() {
  const data = await botApi<{ guild: { name: string; memberCount: number }; configured: Record<string, { name?: string } | string>; note: string }>("/settings");

  return (
    <>
      <h1>Settings</h1>
      <section className="card">
        <h2>{data.guild.name}</h2>
        <p className="muted">{data.guild.memberCount} members</p>
        <p className="muted">{data.note}</p>
      </section>
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>General Configuration</h2>
        <div className="settings-grid">
          {Object.entries(data.configured).map(([key, value]) => (
            <div className="setting" key={key}>
              <span>{key.replace(/([A-Z])/g, " $1")}</span>
              <strong>{typeof value === "string" ? value : value.name}</strong>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
