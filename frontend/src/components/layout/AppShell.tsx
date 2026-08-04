import { ChartNoAxesColumn, ClipboardList, History, House, Layers3, LogOut, School, ShieldCheck, UserCog } from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../stores/auth";
import { homeForRole } from "../../utils/auth";
import { BrandLogo } from "../common/BrandLogo";
import { api } from "../../api/client";

const studentNav = [
  { to: "/app", label: "首页", icon: House, end: true },
  { to: "/app/tasks", label: "训练任务", icon: ClipboardList },
  { to: "/app/history", label: "训练记录", icon: History },
];
const teacherNav = [
  { to: "/teacher", label: "工作台", icon: ChartNoAxesColumn, end: true },
  { to: "/teacher/classes", label: "班级", icon: School },
  { to: "/teacher/topics", label: "题库", icon: Layers3 },
  { to: "/teacher/tasks", label: "任务", icon: ClipboardList },
];
const adminNav = [
  { to: "/admin", label: "工作台", icon: ShieldCheck, end: true },
  { to: "/admin/accounts", label: "账号", icon: UserCog },
  { to: "/admin/classes", label: "班级", icon: School },
];

export function AppShell() {
  const { user, logout } = useAuthStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const nav = user?.role === "admin" ? adminNav : user?.role === "teacher" ? teacherNav : studentNav;
  const signOut = () => { const loginPath = user?.role === "admin" ? "/admin/login" : "/login"; logout(); queryClient.clear(); navigate(loginPath); };
  useEffect(() => {
    if (!user) return;
    const prefetch = (queryKey: string[], path: string) => queryClient.prefetchQuery({ queryKey, queryFn: () => api<unknown>(path) });
    if (user.role === "student") {
      void Promise.all([prefetch(["dashboard"], "/dashboard"), prefetch(["tasks"], "/tasks"), prefetch(["history"], "/sessions/history")]);
    } else if (user.role === "teacher") {
      void Promise.all([prefetch(["dashboard"], "/dashboard"), prefetch(["classes"], "/classes"), prefetch(["topic-banks"], "/topic-banks"), prefetch(["tasks"], "/tasks")]);
    } else {
      void Promise.all([prefetch(["admin-overview"], "/admin/overview"), prefetch(["admin-users"], "/admin/users"), prefetch(["admin-classes"], "/admin/classes")]);
    }
  }, [queryClient, user]);
  return <div className="min-h-screen bg-canvas text-ink">
    <a href="#main-content" className="fixed left-4 top-0 z-[60] -translate-y-full rounded-b-[8px] bg-ink px-3 py-2 text-sm text-white focus:translate-y-0">跳到主要内容</a>
    <header className="app-header fixed inset-x-0 top-0 z-40 border-b border-black/[.07] bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center px-4 sm:px-6 lg:px-8">
        <NavLink to={user ? homeForRole(user.role) : "/login"} className="mr-8"><BrandLogo size="sm" showName /></NavLink>
        <nav className="hidden h-full items-center gap-1 md:flex">
          {nav.map(({ to, label, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex h-9 items-center rounded-[9px] px-3 text-sm transition ${isActive ? "bg-black/[.055] font-medium text-ink" : "text-muted hover:bg-black/[.025] hover:text-ink"}`}>{label}</NavLink>)}
        </nav>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          <div className="text-right"><p className="text-sm font-medium leading-4">{user?.name}</p><p className="mt-1 text-[11px] text-muted">{user?.role === "admin" ? "系统管理员" : user?.role === "teacher" ? "教师" : user?.student_no}</p></div>
          <button className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-black/5 hover:text-ink" onClick={signOut} title="退出登录"><LogOut className="h-4 w-4" /></button>
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2 md:hidden"><span className="max-w-24 truncate text-xs text-muted">{user?.name}</span><button className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-black/5 hover:text-ink" onClick={signOut} aria-label="退出登录"><LogOut className="h-4 w-4" /></button></div>
      </div>
    </header>
    <main id="main-content" className="app-main mx-auto max-w-[1240px] px-4 sm:px-6 md:pb-16 lg:px-8"><Outlet /></main>
    <nav className="mobile-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-black/[.08] bg-white/95 px-2 pt-1.5 backdrop-blur-xl md:hidden" aria-label="移动端主导航">
      <div className="mx-auto grid max-w-lg grid-flow-col auto-cols-fr">{nav.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex min-w-0 flex-col items-center justify-center gap-1 rounded-[9px] px-1 py-1.5 text-[11px] transition-colors ${isActive ? "font-medium text-accent" : "text-muted"}`}><Icon className="h-[18px] w-[18px]" /><span className="max-w-full truncate">{label}</span></NavLink>)}</div>
    </nav>
  </div>;
}
