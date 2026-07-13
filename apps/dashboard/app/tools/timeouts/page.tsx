import { ToolForm } from "../ToolForm";

export default function TimeoutsPage() {
  return (
    <>
      <h1>Timeout Manager</h1>
      <section className="card">
        <ToolForm endpoint="tools/timeout" fields={[
          { name: "memberId", label: "Member ID" },
          { name: "action", label: "Action", options: [{ value: "apply", label: "Apply timeout" }, { value: "remove", label: "Remove timeout" }] },
          { name: "durationMinutes", label: "Duration", options: [{ value: "10", label: "10 minutes" }, { value: "60", label: "1 hour" }, { value: "1440", label: "1 day" }, { value: "10080", label: "7 days" }] },
          { name: "reason", label: "Reason" },
        ]} />
      </section>
    </>
  );
}
