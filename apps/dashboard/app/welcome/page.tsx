import { revalidatePath } from "next/cache";
import { botApi } from "../../lib/api";

async function saveWelcome(formData: FormData) {
  "use server";
  await botApi("/welcome", {
    method: "POST",
    body: JSON.stringify({
      enabled: formData.get("enabled") === "on",
      channelId: formData.get("channelId"),
      roleId: formData.get("roleId"),
      imageUrl: formData.get("imageUrl"),
      title: formData.get("title"),
      description: formData.get("description"),
      action: formData.get("action"),
    }),
  });
  revalidatePath("/welcome");
}

export default async function WelcomePage() {
  const data = await botApi<{ config: Record<string, string | number | null>; channels: { id: string; name: string }[]; roles: { id: string; name: string }[] }>("/welcome");
  const config = data.config;
  const previewTitle = resolvePlaceholders(String(config.title ?? ""));
  const previewDescription = resolvePlaceholders(String(config.description ?? ""));

  return (
    <>
      <h1>Welcome</h1>
      <form className="form" action={saveWelcome}>
        <section className="card form">
          <label><span>Enabled</span><input name="enabled" type="checkbox" defaultChecked={config.enabled === 1} /></label>
          <div className="row">
            <label><span>Welcome channel</span><select name="channelId" defaultValue={String(config.channel_id ?? "")}>{data.channels.map(channel => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}</select></label>
            <label><span>Auto role</span><select name="roleId" defaultValue={String(config.role_id ?? "")}><option value="">None</option>{data.roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
          </div>
          <label><span>Banner URL</span><input name="imageUrl" defaultValue={String(config.image_url ?? "")} /></label>
          <label><span>Title</span><input name="title" defaultValue={String(config.title ?? "")} /></label>
          <label><span>Description</span><textarea name="description" defaultValue={String(config.description ?? "")} /></label>
          <div className="row">
            <button name="action" value="save">Save Changes</button>
            <button name="action" value="enable" className="secondary">Enable</button>
            <button name="action" value="disable" className="secondary">Disable</button>
            <button name="action" value="reset" className="secondary">Reset Wording to Default</button>
          </div>
        </section>
        <section className="card">
          <h2>Preview</h2>
          <div className="discord-preview">
            <div className="embed-bar" />
            <div className="embed-body">
              <h3>{previewTitle}</h3>
              <p>{previewDescription}</p>
              {config.image_url ? <img src={String(config.image_url)} alt="" /> : null}
              <small>Glurps Bot</small>
            </div>
          </div>
        </section>
      </form>
    </>
  );
}

function resolvePlaceholders(value: string) {
  return value
    .replaceAll("{username}", "StillJad")
    .replaceAll("{mention}", "@StillJad")
    .replaceAll("{membercount}", "239")
    .replaceAll("{server}", "Glurps Events")
    .replaceAll("{rules}", "#rules")
    .replaceAll("{announcements}", "#announcements");
}
