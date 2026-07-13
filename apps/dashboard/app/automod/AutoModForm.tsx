"use client";

import { useState, useTransition } from "react";

type AutoModData = {
  config: Record<string, string | number | null> | null;
  bannedWords: { word: string; match_type: string }[];
  allowedDomains: { domain: string }[];
  exemptRoles: { role_id: string }[];
  exemptChannels: { channel_id: string }[];
  channels: { id: string; name: string }[];
};

function checked(config: Record<string, string | number | null>, key: string, fallback = true) {
  const value = config[key];
  return value === undefined || value === null ? fallback : Boolean(value);
}

export function AutoModForm({ data }: { data: AutoModData }) {
  const config = data.config ?? {};
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/dashboard/automod", {
        method: "POST",
        headers: { "content-type": "application/json" },
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
          logChannelId: formData.get("logChannelId") || null,
        }),
      });

      if (!response.ok) {
        console.error(`AutoMod save failed status=${response.status}`);
        setMessage({ type: "error", text: "Changes could not be saved. Please try again." });
        return;
      }

      setMessage({ type: "success", text: "AutoMod settings saved." });
    });
  }

  return (
    <>
      {message ? <div className={`toast ${message.type}`}>{message.text}</div> : null}
      <form className="form" action={save}>
        <section className="card form compact">
          <div className="section-head">
            <div>
              <h2>Protection Settings</h2>
              <p className="muted">Tune the existing Giize AutoMod rules.</p>
            </div>
            <button disabled={pending}>{pending ? "Saving..." : "Save Changes"}</button>
          </div>
          <div className="switch-grid">
            <label className="switch"><input name="enabled" type="checkbox" defaultChecked={checked(config, "enabled", false)} /><span>Enabled</span></label>
            <label className="switch"><input name="spamEnabled" type="checkbox" defaultChecked={checked(config, "spam_enabled")} /><span>Spam</span></label>
            <label className="switch"><input name="duplicateEnabled" type="checkbox" defaultChecked={checked(config, "duplicate_enabled")} /><span>Duplicate messages</span></label>
            <label className="switch"><input name="inviteLinksEnabled" type="checkbox" defaultChecked={checked(config, "invite_links_enabled")} /><span>Invite blocking</span></label>
            <label className="switch"><input name="externalLinksEnabled" type="checkbox" defaultChecked={checked(config, "external_links_enabled", false)} /><span>External links</span></label>
          </div>
          <div className="row">
            <label><span>Mention limit</span><input name="mentionLimit" type="number" min={0} max={20} defaultValue={Number(config.mention_limit ?? 5)} /></label>
            <label><span>Emoji limit</span><input name="emojiLimit" type="number" min={0} max={50} defaultValue={Number(config.emoji_limit ?? 12)} /></label>
            <label><span>Caps percentage</span><input name="capsPercentage" type="number" min={0} max={100} defaultValue={Number(config.caps_percentage ?? 80)} /></label>
            <label><span>Timeout minutes</span><input name="timeoutMinutes" type="number" min={0} max={1440} defaultValue={Number(config.timeout_minutes ?? 10)} /></label>
          </div>
          <label><span>Log channel</span><select name="logChannelId" defaultValue={String(config.log_channel_id ?? "")}><option value="">Use audit default</option>{data.channels.map(channel => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}</select></label>
        </section>
      </form>
      <div className="grid" style={{ marginTop: "1rem" }}>
        <ListCard title="Banned Words" items={data.bannedWords.map(word => `${word.word} (${word.match_type})`)} />
        <ListCard title="Allowed Domains" items={data.allowedDomains.map(domain => domain.domain)} />
        <ListCard title="Exempt Roles" items={data.exemptRoles.map(role => role.role_id)} />
        <ListCard title="Exempt Channels" items={data.exemptChannels.map(channel => channel.channel_id)} />
      </div>
    </>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="card compact">
      <h2>{title}</h2>
      {items.length > 0 ? <ul className="clean-list">{items.map(item => <li key={item}>{item}</li>)}</ul> : <p className="empty">Nothing configured.</p>}
    </section>
  );
}
