import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { AdminAccountsPage } from "../pages/admin/AdminAccountsPage";
import { AdminClassesPage } from "../pages/admin/AdminClassesPage";
import { AdminDashboardPage } from "../pages/admin/AdminDashboardPage";
import { AdminLoginPage } from "../pages/admin/AdminLoginPage";
import { AuthPage } from "../pages/auth/AuthPage";
import { ProfilePage } from "../pages/account/ProfilePage";
import { HistoryPage } from "../pages/student/HistoryPage";
import { StudentDashboard } from "../pages/student/StudentDashboard";
import { TaskDetailPage } from "../pages/student/TaskDetailPage";
import { TaskListPage } from "../pages/student/TaskListPage";
import { TrainingPage } from "../pages/student/TrainingPage";
import { ClassesPage } from "../pages/teacher/ClassesPage";
import { EvaluationPage } from "../pages/teacher/EvaluationPage";
import { SubmissionsPage } from "../pages/teacher/SubmissionsPage";
import { TaskCreatePage } from "../pages/teacher/TaskCreatePage";
import { TasksPage } from "../pages/teacher/TasksPage";
import { TeacherDashboard } from "../pages/teacher/TeacherDashboard";
import { TopicsPage } from "../pages/teacher/TopicsPage";
import { useAuthStore } from "../stores/auth";
import type { Role } from "../types";
import { homeForRole } from "../utils/auth";

function Protected({ role, children }: { role: Role; children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  if (!user) return <Navigate to={role === "admin" ? "/admin/login" : "/login"} replace />;
  if (user.role !== role) return <Navigate to={homeForRole(user.role)} replace />;
  return children;
}

function Authenticated({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function AppRoutes() {
  const user = useAuthStore((state) => state.user);
  return <Routes>
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/register" element={<AuthPage mode="register" />} />
    <Route path="/admin/login" element={<AdminLoginPage />} />
    <Route element={<Authenticated><AppShell /></Authenticated>}>
      <Route path="/profile" element={<ProfilePage />} />
    </Route>
    <Route element={<Protected role="student"><AppShell /></Protected>}>
      <Route path="/app" element={<StudentDashboard />} />
      <Route path="/app/tasks" element={<TaskListPage />} />
      <Route path="/app/tasks/:taskId" element={<TaskDetailPage />} />
      <Route path="/app/training/:sessionId" element={<TrainingPage />} />
      <Route path="/app/history" element={<HistoryPage />} />
      <Route path="/app/history/:sessionId" element={<HistoryPage />} />
    </Route>
    <Route element={<Protected role="teacher"><AppShell /></Protected>}>
      <Route path="/teacher" element={<TeacherDashboard />} />
      <Route path="/teacher/classes" element={<ClassesPage />} />
      <Route path="/teacher/topics" element={<TopicsPage />} />
      <Route path="/teacher/tasks" element={<TasksPage />} />
      <Route path="/teacher/tasks/new" element={<TaskCreatePage />} />
      <Route path="/teacher/tasks/:taskId/submissions" element={<SubmissionsPage />} />
      <Route path="/teacher/evaluations/:sessionId" element={<EvaluationPage />} />
    </Route>
    <Route element={<Protected role="admin"><AppShell /></Protected>}>
      <Route path="/admin" element={<AdminDashboardPage />} />
      <Route path="/admin/accounts" element={<AdminAccountsPage />} />
      <Route path="/admin/classes" element={<AdminClassesPage />} />
    </Route>
    <Route path="*" element={<Navigate to={user ? homeForRole(user.role) : "/login"} replace />} />
  </Routes>;
}
