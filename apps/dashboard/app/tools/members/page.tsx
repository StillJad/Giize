import { botApi } from "../../../lib/api";

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const data = await botApi<{ member: null | { avatar: string; username: string; displayName: string; id: string; joinedAt: number; createdAt: number; roles: { name: string }[]; timeoutUntil: number | null; javaUsername: string | null; bedrockUsername: string | null; warningCount: number; openTicketCount: number; applicationCount: number } }>(`/tools/member?q=${encodeURIComponent(q)}`);

  return (
    <>
      <h1>Member Lookup</h1>
      <section className="card">
        <form className="row">
          <input name="q" placeholder="Username, ID, or mention" defaultValue={q} />
          <button>Search</button>
        </form>
      </section>
      {data.member ? (
        <section className="card" style={{ marginTop: "1rem" }}>
          <div className="member-cell"><img className="avatar" src={data.member.avatar} alt="" /><h2>{data.member.displayName}</h2></div>
          <div className="settings-grid">
            <div className="setting"><span>Username</span><strong>{data.member.username}</strong></div>
            <div className="setting"><span>Discord ID</span><strong>{data.member.id}</strong></div>
            <div className="setting"><span>Joined</span><strong>{new Date(data.member.joinedAt).toLocaleString()}</strong></div>
            <div className="setting"><span>Account created</span><strong>{new Date(data.member.createdAt).toLocaleString()}</strong></div>
            <div className="setting"><span>Timeout</span><strong>{data.member.timeoutUntil ? new Date(data.member.timeoutUntil).toLocaleString() : "None"}</strong></div>
            <div className="setting"><span>Java</span><strong>{data.member.javaUsername ?? "None"}</strong></div>
            <div className="setting"><span>Bedrock</span><strong>{data.member.bedrockUsername ?? "None"}</strong></div>
            <div className="setting"><span>Warnings</span><strong>{data.member.warningCount}</strong></div>
            <div className="setting"><span>Open tickets</span><strong>{data.member.openTicketCount}</strong></div>
            <div className="setting"><span>Applications</span><strong>{data.member.applicationCount}</strong></div>
          </div>
          <h3 style={{ marginTop: "1rem" }}>Roles</h3>
          <p>{data.member.roles.map(role => role.name).join(", ") || "No roles"}</p>
        </section>
      ) : q ? <p className="empty">No member found.</p> : null}
    </>
  );
}
