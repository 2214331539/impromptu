import { useQuery } from "@tanstack/react-query";
import { ArrowRight, School, ShieldCheck, UserCog, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Badge } from "../../components/common/Badge";
import { ErrorState, LoadingState } from "../../components/common/States";
import type { AdminOverview, Role } from "../../types";
import { formatDate } from "../../utils/format";

const roleLabel: Record<Role, string> = { student: "学生", teacher: "教师", admin: "管理员" };

export function AdminDashboardPage() {
  const query = useQuery({ queryKey: ["admin-overview"], queryFn: () => api<AdminOverview>("/admin/overview") });
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState message={query.error?.message} retry={() => query.refetch()} />;
  const metrics = [
    ["全部账号", query.data.metrics.users, UsersRound],
    ["学生", query.data.metrics.students, UsersRound],
    ["教师", query.data.metrics.teachers, UserCog],
    ["班级", query.data.metrics.classes, School],
  ] as const;
  return <div className="page-enter"><header className="mb-8"><div className="flex items-center gap-2 text-sm font-medium text-accent"><ShieldCheck className="h-4 w-4" />系统管理员</div><h1 className="page-title mt-2">系统工作台</h1><p className="mt-2 text-sm text-muted">统一维护人员账号和教学班级。</p></header><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label, value, Icon]) => <article key={label} className="surface p-5"><div className="flex items-center justify-between"><p className="text-sm text-muted">{label}</p><Icon className="h-4 w-4 text-muted" /></div><p className="mt-4 text-3xl font-semibold tabular-nums">{value ?? 0}</p></article>)}</section><div className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_.75fr]"><section className="surface overflow-hidden"><div className="flex items-center justify-between border-b border-black/[.06] px-5 py-4"><h2 className="section-title">最近创建的账号</h2><Link to="/admin/accounts" className="flex items-center gap-1 text-sm text-accent">全部账号<ArrowRight className="h-4 w-4" /></Link></div><div className="divide-y divide-black/[.05]">{query.data.recent_users.map((user) => <div key={user.id} className="flex items-center gap-3 px-5 py-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{user.name}</p><p className="mt-1 text-xs text-muted">{user.student_no} · {formatDate(user.created_at)}</p></div><Badge tone={user.is_active ? "green" : "orange"}>{roleLabel[user.role]}</Badge></div>)}</div></section><section className="surface p-5"><h2 className="section-title">管理入口</h2><div className="mt-4 space-y-2"><Link to="/admin/accounts" className="flex items-center gap-3 rounded-[12px] border border-black/[.07] p-4 transition hover:bg-black/[.025]"><UserCog className="h-5 w-5 text-accent" /><span className="flex-1"><strong className="block text-sm">账号管理</strong><span className="mt-1 block text-xs text-muted">创建教师和管理员</span></span><ArrowRight className="h-4 w-4 text-muted" /></Link><Link to="/admin/classes" className="flex items-center gap-3 rounded-[12px] border border-black/[.07] p-4 transition hover:bg-black/[.025]"><School className="h-5 w-5 text-accent" /><span className="flex-1"><strong className="block text-sm">班级管理</strong><span className="mt-1 block text-xs text-muted">分配教师与启停班级</span></span><ArrowRight className="h-4 w-4 text-muted" /></Link></div></section></div></div>;
}
