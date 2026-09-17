import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { useGet, useAction } from "@/lib/queries";
import { useAuth } from "@/store/auth";
import { PageHeader, Loading, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { fmtDate } from "@/lib/utils";

type U = { id: string; name: string; email: string; isActive: boolean; roleId: string | null; roleName: string | null; branchId: string | null; lastLoginAt: string | null };
type Role = { id: string; name: string }; type Branch = { id: string; name: string; status: string };
const schema = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8, "Min 8 characters"), roleId: z.string().uuid("Select a role"), branchId: z.string().optional() });
type Form = z.infer<typeof schema>;

export default function UsersPage() {
  const { can, user: me } = useAuth();
  const users = useGet<U[]>(["users"], "/users");
  const roles = useGet<Role[]>(["roles"], "/roles");
  const branches = useGet<Branch[]>(["branches"], "/branches");
  const act = useAction([["users"], ["company-dashboard"]]);
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) });
  return (
    <>
      <PageHeader title="Users" sub="People who can sign in to this workspace." actions={can("user.create") && <Button onClick={() => setOpen(true)}><Plus size={16} /> Add user</Button>} />
      {users.isLoading ? <Loading /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[620px]">
          <thead><tr><th className="th">User</th><th className="th">Role</th><th className="th">Branch</th><th className="th">Last login</th><th className="th">Status</th><th className="th"></th></tr></thead>
          <tbody>{users.data?.data?.map((u) => <tr key={u.id}>
            <td className="td"><div className="font-semibold">{u.name}{u.id === me?.id && <span className="ml-2 text-[11px] text-muted">you</span>}</div><div className="text-xs text-muted">{u.email}</div></td>
            <td className="td">{u.roleName ?? "—"}</td>
            <td className="td text-muted">{branches.data?.data?.find((b) => b.id === u.branchId)?.name ?? "All"}</td>
            <td className="td text-muted">{fmtDate(u.lastLoginAt)}</td>
            <td className="td"><Badge status={u.isActive ? "active" : "inactive"} /></td>
            <td className="td text-right">{can("user.update") && u.id !== me?.id && <Button size="sm" variant="ghost" onClick={() => act.mutate({ method: "put", url: `/users/${u.id}`, body: { isActive: !u.isActive } })}>{u.isActive ? "Deactivate" : "Activate"}</Button>}</td>
          </tr>)}</tbody>
        </table></div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Add user">
        <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => act.mutate({ url: "/users", body: { ...v, branchId: v.branchId || undefined } }, { onSuccess: () => { setOpen(false); reset(); } }))}>
          <Field label="Full name" error={errors.name?.message}><input className="field" {...register("name")} /></Field>
          <Field label="Email" error={errors.email?.message}><input className="field" type="email" {...register("email")} /></Field>
          <Field label="Temporary password" error={errors.password?.message}><input className="field" type="text" autoComplete="off" {...register("password")} /></Field>
          <Field label="Role" error={errors.roleId?.message}><select className="field" {...register("roleId")}><option value="">Select…</option>{roles.data?.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
          <Field label="Branch (for branch-scoped roles)"><select className="field" {...register("branchId")}><option value="">All branches</option>{branches.data?.data?.filter((b) => b.status === "active").map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={act.isPending}>Create user</Button></div>
        </form>
      </Modal>
    </>
  );
}
