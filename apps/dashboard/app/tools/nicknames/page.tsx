import { ToolForm } from "../ToolForm";

export default function NicknamesPage() {
  return (
    <>
      <h1>Nickname Manager</h1>
      <section className="card">
        <ToolForm endpoint="tools/nickname" fields={[
          { name: "memberId", label: "Member ID" },
          { name: "nickname", label: "Nickname. Leave empty to reset." },
        ]} />
      </section>
    </>
  );
}
