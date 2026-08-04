import { BookOpen, ChartNoAxesColumn, ClipboardList, History, House, Layers3, LogOut, Menu, School, X } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../stores/auth";

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

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const nav = user?.role === "teacher" ? teacherNav : studentNav;
  const signOut = () => { logout(); queryClient.clear(); navigate("/login"); };
  return <div className="min-h-screen bg-canvas text-ink">
    <header className="fixed inset-x-0 top-0 z-40 border-b border-black/[.07] bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center px-4 sm:px-6 lg:px-8">
        <NavLink to={user?.role === "teacher" ? "/teacher" : "/app"} className="mr-8 flex items-center gap-2 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-ink text-white"><BookOpen className="h-4 w-4" /></span>
          <span>声场</span>
        </NavLink>
        <nav className="hidden h-full items-center gap-1 md:flex">
          {nav.map(({ to, label, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex h-9 items-center rounded-[9px] px-3 text-sm transition ${isActive ? "bg-black/[.055] font-medium text-ink" : "text-muted hover:text-ink"}`}>{label}</NavLink>)}
        </nav>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          <div className="text-right"><p className="text-sm font-medium leading-4">{user?.name}</p><p className="mt-1 text-[11px] text-muted">{user?.role === "teacher" ? "教师" : user?.student_no}</p></div>
          <button className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-black/5 hover:text-ink" onClick={signOut} title="退出登录"><LogOut className="h-4 w-4" /></button>
        </div>
        <button className="ml-auto grid h-9 w-9 place-items-center md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="菜单">{menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      </div>
      {menuOpen && <nav className="border-t border-black/[.06] bg-white px-4 py-3 md:hidden">
        {nav.map(({ to, label, icon: Icon, end }) => <NavLink onClick={() => setMenuOpen(false)} key={to} to={to} end={end} className={({ isActive }) => `flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm ${isActive ? "bg-black/5 font-medium" : "text-muted"}`}><Icon className="h-4 w-4" />{label}</NavLink>)}
        <button onClick={signOut} className="mt-2 flex w-full items-center gap-3 border-t border-black/[.06] px-3 pt-3 text-sm text-muted"><LogOut className="h-4 w-4" />退出登录</button>
      </nav>}
    </header>
    <main className="mx-auto max-w-[1240px] px-4 pb-16 pt-24 sm:px-6 lg:px-8"><Outlet /></main>
  </div>;
}
