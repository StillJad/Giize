import { getGuildContext } from "../../../lib/api";
import { ToolForm } from "../ToolForm";

export default async function ChannelsPage() {
  const { channels } = await getGuildContext();
  return (
    <>
      <h1>Channel Tools</h1>
      <section className="card">
        <ToolForm endpoint="tools/channel" fields={[
          { name: "channelId", label: "Channel", options: channels.map(channel => ({ value: channel.id, label: `#${channel.name}` })) },
          { name: "action", label: "Action", options: [{ value: "lock", label: "Lock" }, { value: "unlock", label: "Unlock" }, { value: "hide", label: "Hide" }, { value: "show", label: "Show" }, { value: "slowmode", label: "Set slowmode" }] },
          { name: "seconds", label: "Slowmode seconds" },
        ]} />
      </section>
    </>
  );
}
