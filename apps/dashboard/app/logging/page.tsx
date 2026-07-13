import { revalidatePath } from "next/cache";
import { botApi } from "../../lib/api";

async function saveLogging(formData: FormData) {
  "use server";
  await botApi("/logging", {
    method: "POST",
    body: JSON.stringify({ automodLogChannelId: formData.get("automodLogChannelId") }),
  });
  revalidatePath("/logging");
}

export default async function LoggingPage() {
  const data = await botApi<{ channels: Record<string, string | null>; permissions: { key: string; channelId: string | null; exists: boolean; name?: string; missing: string[]; permissions?: Record<string, boolean> }[]; allChannels: { id: string; name: string }[] }>("/logging");

  return (
    <>
      <h1>Logging</h1>
      <section className="card">
        <h2>Configured Channels</h2>
        <div className="settings-grid">
          {Object.entries(data.channels).map(([key, value]) => (
            <div className="setting" key={key}>
              <span>{key.replace(/([A-Z])/g, " $1")}</span>
              <strong>{value ?? "Not configured"}</strong>
            </div>
          ))}
        </div>
        <p className="muted">Environment-backed log channels are shown here. AutoMod log channel can be updated from the dashboard.</p>
        <form className="row" action={saveLogging}>
          <select name="automodLogChannelId" defaultValue={data.channels.automodLogChannelId ?? ""}>
            <option value="">Use audit default</option>
            {data.allChannels.map(channel => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
          </select>
          <button>Save AutoMod Log Channel</button>
        </form>
      </section>
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Permission Checks</h2>
        <table className="table">
          <thead><tr><th>Setting</th><th>Channel</th><th>Missing</th></tr></thead>
          <tbody>{data.permissions.map(row => (
            <tr key={row.key}>
              <td>{row.key}</td>
              <td>{row.name ?? row.channelId ?? "Not configured"}</td>
              <td>{row.missing.length > 0 ? row.missing.join(", ") : "None"}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </>
  );
}
