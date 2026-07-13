import { revalidatePath } from "next/cache";
import { botApi } from "../../lib/api";

async function saveAutoMod(formData: FormData) {
  "use server";
  await botApi("/automod", {
    method: "POST",
    body: JSON.stringify({
      enabled: formData.get("enabled") === "on",
      spamEnabled: formData.get("spamEnabled") === "on",
      duplicateEnabled: formData.get("duplicateEnabled") === "on",
      mentionLimit: Number(formData.get("mentionLimit")),
      emojiLimit: Number(formData.get("emojiLimit")),
      capsPercentage: Number(formData.get("capsPercentage")),
      inviteLinksEnabled: formData.get("inviteLinksEnabled") === "on",
      externalLinksEnabled: formData.get("externalLinksEnabled") === "on",
      timeoutMinutes: Number(formData.get("timeoutMinutes")),
      logChannelId: formData.get("logChannelId"),
    }),
  });
  revalidatePath("/automod");
}

export default async function AutoModPage() {
  const data = await botApi<{ config: Record<string, string | number | null> | null; bannedWords: unknown[]; allowedDomains: unknown[]; exemptRoles: unknown[]; exemptChannels: unknown[]; channels: { id: string; name: string }[] }>("/automod");
  const config = data.config ?? {};

  return (
    <>
      <h1>AutoMod</h1>
      <form className="form" action={saveAutoMod}>
        <section className="card form">
          <div className="row">
            {[
              ["enabled", "Enabled"],
              ["spamEnabled", "Spam"],
              ["duplicateEnabled", "Duplicate messages"],
              ["inviteLinksEnabled", "Invite blocking"],
              ["externalLinksEnabled", "External-link blocking"],
            ].map(([name, label]) => <label key={name}><span>{label}</span><input name={name} type="checkbox" defaultChecked={Boolean(config[name.replace(/[A-Z]/g, match => `_${match.toLowerCase()}`)] ?? config[name])} /></label>)}
          </div>
          <div className="row">
            <label><span>Mention limit</span><input name="mentionLimit" type="number" defaultValue={Number(config.mention_limit ?? 5)} /></label>
            <label><span>Emoji limit</span><input name="emojiLimit" type="number" defaultValue={Number(config.emoji_limit ?? 12)} /></label>
            <label><span>Caps percentage</span><input name="capsPercentage" type="number" defaultValue={Number(config.caps_percentage ?? 80)} /></label>
            <label><span>Timeout minutes</span><input name="timeoutMinutes" type="number" defaultValue={Number(config.timeout_minutes ?? 10)} /></label>
          </div>
          <label><span>Log channel</span><select name="logChannelId" defaultValue={String(config.log_channel_id ?? "")}><option value="">Audit default</option>{data.channels.map(channel => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}</select></label>
          <button>Save AutoMod</button>
        </section>
      </form>
      <div className="grid" style={{ marginTop: "1rem" }}>
        <section className="card"><h2>Banned Words</h2><pre className="muted">{JSON.stringify(data.bannedWords, null, 2)}</pre></section>
        <section className="card"><h2>Allowed Domains</h2><pre className="muted">{JSON.stringify(data.allowedDomains, null, 2)}</pre></section>
        <section className="card"><h2>Exempt Roles</h2><pre className="muted">{JSON.stringify(data.exemptRoles, null, 2)}</pre></section>
        <section className="card"><h2>Exempt Channels</h2><pre className="muted">{JSON.stringify(data.exemptChannels, null, 2)}</pre></section>
      </div>
    </>
  );
}
