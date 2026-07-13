import { getGuildContext } from "../../../lib/api";
import { ToolForm } from "../ToolForm";

export default async function AnnouncementsPage() {
  const { channels, roles } = await getGuildContext();
  return (
    <>
      <h1>Announcement Sender</h1>
      <section className="card">
        <ToolForm endpoint="tools/announcement" fields={[
          { name: "channelId", label: "Destination", options: channels.map(channel => ({ value: channel.id, label: `#${channel.name}` })) },
          { name: "title", label: "Title" },
          { name: "description", label: "Description" },
          { name: "imageUrl", label: "Optional image URL" },
          { name: "roleId", label: "Optional role mention", options: [{ value: "", label: "No role" }, ...roles.map(role => ({ value: role.id, label: role.name }))] },
        ]}>
          <p className="muted">Only the selected role can be mentioned. Everyone and here are blocked.</p>
        </ToolForm>
      </section>
    </>
  );
}
