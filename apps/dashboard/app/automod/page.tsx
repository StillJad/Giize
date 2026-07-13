import { botApi } from "../../lib/api";
import { AutoModForm } from "./AutoModForm";

export default async function AutoModPage() {
  const data = await botApi<{
    config: Record<string, string | number | null> | null;
    bannedWords: { word: string; match_type: string }[];
    allowedDomains: { domain: string }[];
    exemptRoles: { role_id: string }[];
    exemptChannels: { channel_id: string }[];
    channels: { id: string; name: string }[];
    roles: { id: string; name: string }[];
  }>("/automod");

  return (
    <>
      <h1>AutoMod</h1>
      <AutoModForm data={data} />
    </>
  );
}
