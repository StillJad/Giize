import { botApi } from "../../lib/api";

export default async function VerificationPage() {
  const data = await botApi<{
    configured: boolean;
    javaRole: { name: string };
    bedrockRole: { name: string };
    verificationLogChannel: { name: string };
    nicknamePreference: string[];
  }>("/verification");

  return (
    <>
      <h1>Verification</h1>
      <div className="grid">
        <section className="card"><div className="muted">Status</div><div className="metric">{data.configured ? "Configured" : "Needs setup"}</div></section>
        <section className="card"><div className="muted">Java role</div><strong>{data.javaRole.name}</strong></section>
        <section className="card"><div className="muted">Bedrock role</div><strong>{data.bedrockRole.name}</strong></section>
        <section className="card"><div className="muted">Log channel</div><strong>{data.verificationLogChannel.name}</strong></section>
      </div>
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Nickname Preference</h2>
        <ol>{data.nicknamePreference.map(item => <li key={item}>{item}</li>)}</ol>
      </section>
    </>
  );
}
