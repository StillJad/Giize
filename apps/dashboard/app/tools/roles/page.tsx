import { getGuildContext } from "../../../lib/api";
import { ToolForm } from "../ToolForm";

export default async function RolesPage() {
  const { roles } = await getGuildContext();
  return (
    <>
      <h1>Role Manager</h1>
      <section className="card">
        <ToolForm endpoint="tools/role" fields={[
          { name: "memberId", label: "Member ID" },
          { name: "roleId", label: "Role", options: roles.map(role => ({ value: role.id, label: role.name })) },
          { name: "action", label: "Action", options: [{ value: "add", label: "Add role" }, { value: "remove", label: "Remove role" }] },
        ]} />
      </section>
    </>
  );
}
