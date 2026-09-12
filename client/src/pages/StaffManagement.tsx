import { useState } from "react";
import { Check, MailPlus, MoreHorizontal, ShieldCheck, Trash2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { STAFF_ROLES, StaffRole } from "@shared/cinebites";

const roleDescriptions: Record<StaffRole, string> = { OWNER_ADMIN: "Full system control", ADMIN: "Admin console + staff", MANAGER: "Operations + menu", KITCHEN: "Kitchen queue", CASHIER: "Orders + handoff", READ_ONLY: "View-only access" };

export default function StaffManagement() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("KITCHEN");
  const staff = trpc.admin.staff.useQuery();
  const invite = trpc.admin.inviteStaff.useMutation({ onSuccess: (member) => { setName(""); setEmail(""); toast.success("Invitation created", { description: `${member.email} will join as ${member.role}.` }); void staff.refetch(); }, onError: (error) => toast.error("Invitation failed", { description: error.message }) });
  const updateRole = trpc.admin.updateStaffRole.useMutation({ onSuccess: (member) => { toast.success("Role updated", { description: `${member.name} is now ${member.role}.` }); void staff.refetch(); }, onError: (error) => toast.error("Role update failed", { description: error.message }) });
  const removeStaff = trpc.admin.removeStaff.useMutation({ onSuccess: (res) => { toast.success("Staff member removed", { description: `${res.email} has been removed from staff directory.` }); void staff.refetch(); }, onError: (error) => toast.error("Removal failed", { description: error.message }) });

  return (
    <section className="staff-management">
      <div className="staff-management-grid">
        <section className="admin-panel invite-panel">
          <div className="empty-admin-icon"><MailPlus size={22} /></div>
          <p className="admin-kicker">Add a teammate</p>
          <h2>Invite staff member</h2>
          <p>Send a role-scoped invite. The employee will complete authentication before receiving access.</p>
          <form onSubmit={(event) => { event.preventDefault(); invite.mutate({ name, email, role }); }}>
            <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Neha Sharma" required /></label>
            <label>Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="neha@theatre.example" required /></label>
            <label>Role<select value={role} onChange={(event) => setRole(event.target.value as StaffRole)}>{STAFF_ROLES.filter((item) => item !== "OWNER_ADMIN").map((item) => <option key={item} value={item}>{item} — {roleDescriptions[item]}</option>)}</select></label>
            <button className="primary-small" disabled={invite.isPending}><MailPlus size={14} /> {invite.isPending ? "Creating invite…" : "Create invite"}</button>
          </form>
        </section>
        <section className="admin-panel role-panel">
          <div className="panel-heading"><div><p className="admin-kicker">Permission model</p><h2>Role guide</h2></div><ShieldCheck size={18} className="panel-muted" /></div>
          <div className="role-guide">{STAFF_ROLES.map((item) => <div key={item}><span>{item}</span><small>{roleDescriptions[item]}</small></div>)}</div>
        </section>
      </div>
      <section className="admin-panel staff-directory">
        <div className="table-toolbar">
          <div><p className="admin-kicker">Approved people</p><h2>Staff directory</h2></div>
          <span className="audit-safe"><Users size={14} /> {staff.data?.length ?? 0} records</span>
        </div>
        <div className="staff-directory-list">
          {(staff.data ?? []).map((member) => (
            <div className="staff-directory-row" key={member.id}>
              <div className="staff-avatar"><UserRound size={15} /></div>
              <div className="staff-directory-copy"><strong>{member.name}</strong><span>{member.email}</span></div>
              <span className={`staff-status ${member.status.toLowerCase()}`}><span />{member.status}</span>
              <label className="role-select">
                <select value={member.role} onChange={(event) => updateRole.mutate({ id: member.id, role: event.target.value as StaffRole })} disabled={member.role === "OWNER_ADMIN" || updateRole.isPending}>
                  {STAFF_ROLES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              {member.role !== "OWNER_ADMIN" ? (
                <button
                  className="row-menu hover:text-rose-400 hover:bg-rose-500/10 transition"
                  title="Remove staff member"
                  onClick={() => {
                    if (confirm(`Remove ${member.name} (${member.email}) from staff?`)) {
                      removeStaff.mutate({ email: member.email });
                    }
                  }}
                  disabled={removeStaff.isPending}
                >
                  <Trash2 size={15} />
                </button>
              ) : (
                <button className="row-menu" title="Staff actions"><MoreHorizontal size={17} /></button>
              )}
            </div>
          ))}
        </div>
        <div className="staff-security-note"><Check size={14} /> Role changes are audited and take effect on the next authenticated request.</div>
      </section>
    </section>
  );
}
