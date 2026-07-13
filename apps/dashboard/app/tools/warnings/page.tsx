import { ToolForm } from "../ToolForm";

export default function WarningsPage() {
  return (
    <>
      <h1>Warning Manager</h1>
      <section className="card">
        <ToolForm endpoint="tools/warnings" fields={[
          { name: "memberId", label: "Member ID" },
          { name: "action", label: "Action", options: [{ value: "warn", label: "Warn" }, { value: "clear-one", label: "Clear one warning" }, { value: "clear-all", label: "Clear all warnings" }] },
          { name: "warningId", label: "Warning ID for clear-one" },
          { name: "reason", label: "Reason" },
        ]} />
      </section>
    </>
  );
}
