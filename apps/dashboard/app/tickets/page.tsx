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
    config: Record<string, string>;
    counts: Record<string, number>;
    tickets: { ticketNumber: string | null; creatorId: string | null; type: string | null; priority: string; channel: string; openedAt: number }[];
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
        <pre className="muted">{JSON.stringify(data.config, null, 2)}</pre>
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
            <tr key={ticket.channel}>
              <td>{ticket.ticketNumber ?? "-"}</td>
              <td>{ticket.creatorId ? `<@${ticket.creatorId}>` : "-"}</td>
              <td>{ticket.type ?? "-"}</td>
              <td>{ticket.priority}</td>
              <td>{ticket.channel}</td>
              <td>{ticket.openedAt ? new Date(ticket.openedAt).toLocaleString() : "-"}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </>
  );
}
