import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Power, Trash2, UserCog } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "../../api/client";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Modal } from "../../components/common/Modal";
import { EmptyState, ErrorState, InlineMessage, LoadingState } from "../../components/common/States";
import { useAuthStore } from "../../stores/auth";
import type { AdminUser, Role } from "../../types";
import { formatDate } from "../../utils/format";

const createSchema = z
  .object({
    student_no: z.string().min(3).max(32),
    name: z.string().min(2).max(80),
    password: z.string().min(6).max(72),
    role: z.enum(["student", "teacher", "admin"]),
  })
  .superRefine((values, context) => {
    if (values.role === "student" && !/^\d{6}$/.test(values.student_no)) {
      context.addIssue({ code: "custom", path: ["student_no"], message: "学生学号必须为 6 位数字" });
    }
  });
const resetSchema = z
  .object({
    password: z.string().min(6, "新密码至少 6 位").max(72),
    confirm_password: z.string().min(6, "请再次输入新密码").max(72),
  })
  .superRefine((values, context) => {
    if (values.password !== values.confirm_password) {
      context.addIssue({ code: "custom", path: ["confirm_password"], message: "两次输入的新密码不一致" });
    }
  });

type Values = z.infer<typeof createSchema>;
type ResetValues = z.infer<typeof resetSchema>;

const roleLabel: Record<Role, string> = { student: "学生", teacher: "教师", admin: "管理员" };

export function AdminAccountsPage() {
  const currentUser = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [filter, setFilter] = useState<Role | "all">("all");
  const form = useForm<Values>({
    resolver: zodResolver(createSchema),
    defaultValues: { student_no: "", name: "", password: "", role: "teacher" },
  });
  const resetForm = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirm_password: "" },
  });
  const selectedRole = form.watch("role");

  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => api<AdminUser[]>("/admin/users") });
  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["admin-users"] }),
      client.invalidateQueries({ queryKey: ["admin-overview"] }),
    ]);
  };
  const create = useMutation({
    mutationFn: (values: Values) =>
      api<AdminUser>("/admin/users", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: async () => {
      setOpen(false);
      form.reset();
      await invalidate();
    },
  });
  const toggle = useMutation({
    mutationFn: (user: AdminUser) =>
      api<AdminUser>(`/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !user.is_active }),
      }),
    onSuccess: invalidate,
  });
  const resetPassword = useMutation({
    mutationFn: ({ user, values }: { user: AdminUser; values: ResetValues }) =>
      api<AdminUser>(`/admin/users/${user.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password: values.password }),
      }),
    onSuccess: async () => {
      setResetUser(null);
      resetForm.reset();
      await invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (user: AdminUser) => api<void>(`/admin/users/${user.id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  if (users.isLoading) return <LoadingState />;
  if (users.isError) return <ErrorState message={users.error.message} retry={() => users.refetch()} />;

  const visible = (users.data || []).filter((user) => filter === "all" || user.role === filter);
  const busy = toggle.isPending || remove.isPending || resetPassword.isPending;

  return (
    <div className="page-enter">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">账号管理</h1>
          <p className="mt-2 text-sm text-muted">创建教师和管理员账号，管理学生账号状态，并为学生或教师重置密码。</p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
          创建账号
        </Button>
      </header>

      <div className="mb-4 flex items-center gap-2">
        <label className="text-xs text-muted" htmlFor="role-filter">
          筛选身份
        </label>
        <select
          id="role-filter"
          className="h-9 rounded-[10px] border border-black/10 bg-white px-3 text-sm"
          value={filter}
          onChange={(event) => setFilter(event.target.value as Role | "all")}
        >
          <option value="all">全部</option>
          <option value="student">学生</option>
          <option value="teacher">教师</option>
          <option value="admin">管理员</option>
        </select>
      </div>

      {visible.length ? (
        <section className="surface overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="border-b border-black/[.06] text-xs text-muted">
                <th className="px-5 py-3 font-medium">姓名</th>
                <th className="px-5 py-3 font-medium">账号</th>
                <th className="px-5 py-3 font-medium">身份</th>
                <th className="px-5 py-3 font-medium">创建时间</th>
                <th className="px-5 py-3 font-medium">状态</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((user) => {
                const isSelf = user.id === currentUser?.id;
                const canReset = user.role === "student" || user.role === "teacher";
                return (
                  <tr key={user.id} className="border-b border-black/[.05] last:border-0">
                    <td className="px-5 py-4 text-sm font-medium">{user.name}</td>
                    <td className="px-5 py-4 text-sm text-muted">{user.student_no}</td>
                    <td className="px-5 py-4">
                      <Badge tone={user.role === "admin" ? "blue" : undefined}>{roleLabel[user.role]}</Badge>
                    </td>
                    <td className="px-5 py-4 text-sm text-muted">{formatDate(user.created_at)}</td>
                    <td className="px-5 py-4">
                      <Badge tone={user.is_active ? "green" : "orange"}>{user.is_active ? "正常" : "已停用"}</Badge>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          title="重置密码"
                          disabled={busy || !canReset}
                          onClick={() => setResetUser(user)}
                          className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-black/[.04] hover:text-ink disabled:opacity-30"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title={user.is_active ? "停用账号" : "启用账号"}
                          disabled={busy || isSelf}
                          onClick={() => toggle.mutate(user)}
                          className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-black/[.04] hover:text-ink disabled:opacity-30"
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title={isSelf ? "不能删除当前账号" : "删除账号"}
                          disabled={busy || isSelf}
                          onClick={() => {
                            if (confirm(`确定删除账号「${user.name}」？相关班级、训练、录音和评价数据也会被删除。`)) {
                              remove.mutate(user);
                            }
                          }}
                          className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-red-50 hover:text-danger disabled:opacity-30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : (
        <EmptyState title="没有符合条件的账号" description="调整筛选条件，或创建新账号。" />
      )}

      {(toggle.error || remove.error || resetPassword.error) && (
        <div className="mt-4">
          <InlineMessage>{toggle.error?.message || remove.error?.message || resetPassword.error?.message}</InlineMessage>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="创建系统账号">
        <form className="space-y-4" onSubmit={form.handleSubmit((values) => create.mutate(values))}>
          <div>
            <label className="label">姓名</label>
            <input className="field" {...form.register("name")} />
          </div>
          <div>
            <label className="label">{selectedRole === "student" ? "6 位数字学号" : "账号 / 工号"}</label>
            <input
              className="field"
              autoCapitalize={selectedRole === "student" ? "off" : "characters"}
              inputMode={selectedRole === "student" ? "numeric" : "text"}
              maxLength={selectedRole === "student" ? 6 : 32}
              placeholder={selectedRole === "student" ? "例如 250001" : "输入账号或工号"}
              {...form.register("student_no")}
            />
            {form.formState.errors.student_no && (
              <p className="mt-1 text-xs text-danger">{form.formState.errors.student_no.message}</p>
            )}
          </div>
          <div>
            <label className="label">初始密码</label>
            <input className="field" type="password" autoComplete="new-password" {...form.register("password")} />
          </div>
          <div>
            <label className="label">身份</label>
            <select className="field" {...form.register("role")}>
              <option value="teacher">教师</option>
              <option value="admin">管理员</option>
              <option value="student">学生</option>
            </select>
          </div>
          {create.error && <InlineMessage>{create.error.message}</InlineMessage>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" loading={create.isPending} icon={<UserCog className="h-4 w-4" />}>
              创建账号
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!resetUser}
        onClose={() => {
          setResetUser(null);
          resetForm.reset();
        }}
        title="重置密码"
      >
        <form
          className="space-y-4"
          onSubmit={resetForm.handleSubmit((values) => {
            if (resetUser) resetPassword.mutate({ user: resetUser, values });
          })}
        >
          <p className="text-sm text-muted">
            正在为 <span className="font-medium text-ink">{resetUser?.name}</span> 设置新密码。
          </p>
          <div>
            <label className="label">新密码</label>
            <input className="field" type="password" autoComplete="new-password" {...resetForm.register("password")} />
            {resetForm.formState.errors.password && (
              <p className="mt-1 text-xs text-danger">{resetForm.formState.errors.password.message}</p>
            )}
          </div>
          <div>
            <label className="label">确认新密码</label>
            <input className="field" type="password" autoComplete="new-password" {...resetForm.register("confirm_password")} />
            {resetForm.formState.errors.confirm_password && (
              <p className="mt-1 text-xs text-danger">{resetForm.formState.errors.confirm_password.message}</p>
            )}
          </div>
          {resetPassword.error && <InlineMessage>{resetPassword.error.message}</InlineMessage>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setResetUser(null);
                resetForm.reset();
              }}
            >
              取消
            </Button>
            <Button type="submit" loading={resetPassword.isPending} icon={<KeyRound className="h-4 w-4" />}>
              保存新密码
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
