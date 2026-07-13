import { revalidatePath } from "next/cache";
import { botApi } from "../../lib/api";

async function sendPanel(formData: FormData) {
  "use server";
  await botApi("/tickets/panel", {
    method: "POST",
    body: JSON.stringify({ channelId: formData.get("channelId") }),
  });
  revalidatePath("/tickets");
}

export default async function TicketsPage() {
  const data = await botApi<{
    guildId: string;
    config: Record<string, { id: string; name: string }>;
    counts: Record<string, number>;
    tickets: { ticketNumber: string | null; creatorId: string | null; creatorName: string; creatorAvatar: string | null; type: string | null; priority: string; channelId: string; channelName: string; openedAt: number | null }[];
    channels: { id: string; name: string }[];
  }>("/tickets");

  return (
    <>
      <h1>Tickets</h1>
      <div className="grid">
        {Object.entries(data.counts).map(([priority, count]) => <section className="card" key={priority}><div className="muted">{priority}</div><div className="metric">{count}</div></section>)}
      </div>
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Configuration</h2>
        <div className="settings-grid">
          {Object.entries(data.config).map(([label, value]) => (
            <div className="setting" key={label}>
              <span>{humanize(label)}</span>
              <strong>{value.name}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Send Ticket Panel</h2>
        <form className="row" action={sendPanel}>
          <select name="channelId">{data.channels.map(channel => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}</select>
          <button>Send Standard Ticket Panel</button>
        </form>
      </section>
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Open Tickets</h2>
        <table className="table">
          <thead><tr><th>#</th><th>Creator</th><th>Type</th><th>Priority</th><th>Channel</th><th>Opened</th></tr></thead>
          <tbody>{data.tickets.map(ticket => (
            <tr key={ticket.channelId}>
              <td>{ticket.ticketNumber ?? "-"}</td>
              <td><span className="member-cell">{ticket.creatorAvatar ? <img className="mini-avatar" src={ticket.creatorAvatar} alt="" /> : null}{ticket.creatorName}</span></td>
              <td>{ticket.type ?? "-"}</td>
              <td>{ticket.priority}</td>
              <td><a className="channel-link" href={`https://discord.com/channels/${data.guildId}/${ticket.channelId}`}>#{ticket.channelName}</a></td>
              <td>{ticket.openedAt ? new Date(ticket.openedAt).toLocaleString() : "-"}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </>
  );
}

function humanize(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, letter => letter.toUpperCase());
}
