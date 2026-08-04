import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Check, Mic2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { api } from "../../api/client";
import { Button } from "../../components/common/Button";
import { InlineMessage } from "../../components/common/States";
import { useAuthStore } from "../../stores/auth";
import type { AuthResponse, Role } from "../../types";

const baseSchema = z.object({ student_no: z.string().min(3, "请输入学号或工号"), password: z.string().min(6, "密码至少 6 位"), name: z.string().optional(), role: z.enum(["student", "teacher"]).optional() });
type AuthValues = z.infer<typeof baseSchema>;

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const auth = useAuthStore();
  const navigate = useNavigate();
  const schema = baseSchema.superRefine((values, context) => {
    if (mode === "register" && (!values.name || values.name.trim().length < 2)) context.addIssue({ code: "custom", path: ["name"], message: "请输入姓名" });
  });
  const form = useForm<AuthValues>({ resolver: zodResolver(schema), defaultValues: { student_no: "", password: "", name: "", role: "student" } });
  const mutation = useMutation({
    mutationFn: (values: AuthValues) => api<AuthResponse>(`/auth/${mode}`, { method: "POST", body: JSON.stringify(values) }),
    onSuccess: (data) => { auth.setAuth(data); navigate(data.user.role === "teacher" ? "/teacher" : "/app", { replace: true }); },
  });
  if (auth.user) return <Navigate to={auth.user.role === "teacher" ? "/teacher" : "/app"} replace />;
  return <div className="min-h-screen bg-[#f5f5f7] px-4 py-8 sm:py-14">
    <div className="mx-auto grid min-h-[calc(100vh-7rem)] max-w-[1040px] overflow-hidden rounded-[24px] border border-black/[.08] bg-white shadow-quiet lg:grid-cols-[.92fr_1.08fr]">
      <aside className="hidden flex-col justify-between bg-[#202124] p-10 text-white lg:flex">
        <div className="flex items-center gap-2.5 font-semibold"><span className="grid h-9 w-9 place-items-center rounded-[10px] bg-white text-ink"><BookOpen className="h-4 w-4" /></span>声场</div>
        <div><Mic2 className="mb-6 h-7 w-7 text-white/70" /><h1 className="max-w-sm text-[38px] font-semibold leading-[1.16]">把每一次开口，变成可见的进步。</h1><p className="mt-5 max-w-sm text-[15px] leading-7 text-white/58">随机题目、准确计时、真实录音与教师反馈，在一个安静而专注的训练空间完成。</p></div>
        <div className="space-y-3 text-sm text-white/65"><p className="flex items-center gap-2"><Check className="h-4 w-4" />服务端计时，刷新后继续</p><p className="flex items-center gap-2"><Check className="h-4 w-4" />浏览器录音与即时回放</p></div>
      </aside>
      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-[390px] page-enter">
          <div className="mb-9 lg:hidden"><div className="flex items-center gap-2 font-semibold"><BookOpen className="h-5 w-5" />声场</div></div>
          <p className="text-sm font-medium text-accent">{mode === "login" ? "欢迎回来" : "创建账号"}</p>
          <h2 className="mt-2 text-[32px] font-semibold">{mode === "login" ? "登录训练空间" : "开始口语训练"}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">使用学校分配的学号或教师工号登录。</p>
          <form className="mt-8 space-y-4" onSubmit={form.handleSubmit((data) => mutation.mutate(data))}>
            {mode === "register" && <>
              <div><label className="label">姓名</label><input className="field" autoComplete="name" {...form.register("name")} />{form.formState.errors.name && <p className="mt-1 text-xs text-danger">{form.formState.errors.name.message}</p>}</div>
              <div><label className="label">身份</label><div className="grid grid-cols-2 gap-2 rounded-[12px] bg-black/[.04] p-1"><RoleButton form={form} role="student" label="学生" /><RoleButton form={form} role="teacher" label="教师" /></div></div>
            </>}
            <div><label className="label">{mode === "register" ? "学号 / 工号" : "账号"}</label><input className="field" autoCapitalize="characters" autoComplete="username" placeholder="例如 S2025001" {...form.register("student_no")} />{form.formState.errors.student_no && <p className="mt-1 text-xs text-danger">{form.formState.errors.student_no.message}</p>}</div>
            <div><label className="label">密码</label><input className="field" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} {...form.register("password")} />{form.formState.errors.password && <p className="mt-1 text-xs text-danger">{form.formState.errors.password.message}</p>}</div>
            {mutation.error && <InlineMessage>{mutation.error.message}</InlineMessage>}
            <Button type="submit" size="lg" className="w-full" loading={mutation.isPending} icon={<ArrowRight className="h-4 w-4" />}>{mode === "login" ? "登录" : "注册并进入"}</Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted">{mode === "login" ? "还没有账号？" : "已有账号？"}<Link className="ml-1 font-medium text-accent hover:underline" to={mode === "login" ? "/register" : "/login"}>{mode === "login" ? "注册" : "登录"}</Link></p>
        </div>
      </main>
    </div>
  </div>;
}

function RoleButton({ form, role, label }: { form: ReturnType<typeof useForm<AuthValues>>; role: Role; label: string }) {
  const selected = form.watch("role") === role;
  return <button type="button" onClick={() => form.setValue("role", role)} className={`h-9 rounded-[9px] text-sm transition ${selected ? "bg-white font-medium shadow-sm" : "text-muted"}`}>{label}</button>;
}
