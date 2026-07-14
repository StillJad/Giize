import { revalidatePath } from "next/cache";
import { botApi } from "../../lib/api";
import { EventActionButtons } from "./EventActionButtons";

async function createEvent(formData: FormData) {
  "use server";
  const startLocal = String(formData.get("startLocal") ?? "");
  const start = startLocal ? `<t:${Math.floor(new Date(startLocal).getTime() / 1000)}:F>` : "";
  await botApi("/events", {
    method: "POST",
    body: JSON.stringify({ ...Object.fromEntries(formData), start }),
  });
  revalidatePath("/events");
}

async function eventAction(formData: FormData) {
  "use server";
  const eventId = formData.get("eventId");
  const action = formData.get("action");
  if (action === "end") await botApi(`/events/${eventId}/end`, { method: "POST", body: "{}" });
  if (action === "delete") await botApi(`/events/${eventId}`, { method: "DELETE" });
  revalidatePath("/events");
}

async function reviewApplication(formData: FormData) {
  "use server";
  await botApi(`/applications/${formData.get("applicationId")}`, {
    method: "POST",
    body: JSON.stringify({ status: formData.get("status") }),
  });
  revalidatePath("/events");
}

type EventRow = {
  eventNumber: number;
  title: string;
  status: string;
  startTimestamp: number;
  endTimestamp: number;
  channelId: string;
  applications: { accepted: number; pending: number; rejected: number };
  acceptedParticipants: number;
};

type ApplicationRow = {
  id: number;
  event_id: number;
  discord_id: string;
  minecraft_username: string;
  platform: string;
  priority: string;
  status: string;
  answer_one: string;
  answer_two: string;
};

export default async function EventsPage() {
  const data = await botApi<{ events: EventRow[]; applications: ApplicationRow[]; channels: { id: string; name: string }[]; roles: { id: string; name: string }[] }>("/events");

  return (
    <>
      <h1>Events</h1>
      <section className="card">
        <h2>Create Event</h2>
        <form className="form" action={createEvent}>
          <div className="row">
            <label><span>Title</span><input name="title" required /></label>
            <label><span>Start time</span><input name="startLocal" type="datetime-local" /></label>
          </div>
          <label><span>Description</span><textarea name="description" required /></label>
          <div className="row">
            <label><span>Duration</span><input name="duration" placeholder="2h" /></label>
            <label><span>Channel</span><select name="channelId">{data.channels.map(channel => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}</select></label>
            <label><span>Ping role</span><select name="pingRole"><option value="">None</option>{data.roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
            <label><span>Going role</span><select name="goingRole"><option value="">None</option>{data.roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
          </div>
          <button>Create Event</button>
        </form>
      </section>
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Events</h2>
        <table className="table">
          <thead><tr><th>ID</th><th>Title</th><th>Status</th><th>Start</th><th>Applications</th><th>Participants</th><th>Actions</th></tr></thead>
          <tbody>{data.events.map(event => (
            <tr key={event.eventNumber}>
              <td>{event.eventNumber}</td>
              <td>{event.title}</td>
              <td><span className="pill">{event.status}</span></td>
              <td>{event.startTimestamp > 0 ? new Date(event.startTimestamp).toLocaleString() : "TBA"}</td>
              <td>{event.applications.accepted} accepted / {event.applications.pending} pending / {event.applications.rejected} rejected</td>
              <td>{event.acceptedParticipants}</td>
              <td>
                <form action={eventAction}>
                  <input type="hidden" name="eventId" value={event.eventNumber} />
                  <EventActionButtons ended={event.status === "ended"} />
                </form>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </section>
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Pending Applications</h2>
        {data.applications.filter(app => app.status === "pending").map(app => (
          <div className="card" key={app.id} style={{ marginTop: "0.75rem" }}>
            <h3>{app.minecraft_username} <span className="pill">{app.priority}</span></h3>
            <p className="muted">Applicant: &lt;@{app.discord_id}&gt; · Platform: {app.platform}</p>
            <p><strong>Why:</strong> {app.answer_one}</p>
            <p><strong>What:</strong> {app.answer_two}</p>
            <form action={reviewApplication}>
              <input type="hidden" name="applicationId" value={app.id} />
              <button name="status" value="accepted">Accept</button>{" "}
              <button name="status" value="rejected" className="danger">Reject</button>
            </form>
          </div>
        ))}
      </section>
    </>
  );
}
