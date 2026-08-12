import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, MessageCircle, ShieldCheck, Sparkles, Star } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { api } from "../../api/client";
import { BrandLogo } from "../../components/common/BrandLogo";
import { Button } from "../../components/common/Button";
import { IcpFooter } from "../../components/common/IcpFooter";
import { InlineMessage } from "../../components/common/States";
import { useAuthStore } from "../../stores/auth";
import type { AuthResponse } from "../../types";
import { homeForRole } from "../../utils/auth";

const sixDigitStudentId = /^\d{6}$/;
const staffId = /^[A-Za-z][A-Za-z0-9_-]{2,31}$/;
const baseSchema = z.object({
  student_no: z.string().min(1, "请输入账号"),
  password: z.string().min(6, "密码至少 6 位"),
  name: z.string().optional(),
});
type AuthValues = z.infer<typeof baseSchema>;

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const auth = useAuthStore();
  const navigate = useNavigate();
  const schema = baseSchema.superRefine((values, context) => {
    if (mode === "register" && (!values.name || values.name.trim().length < 2)) {
      context.addIssue({ code: "custom", path: ["name"], message: "请输入姓名" });
    }
    if (mode === "register" && !sixDigitStudentId.test(values.student_no)) {
      context.addIssue({ code: "custom", path: ["student_no"], message: "学号必须为 6 位数字" });
    }
    if (mode === "login" && !sixDigitStudentId.test(values.student_no) && !staffId.test(values.student_no)) {
      context.addIssue({ code: "custom", path: ["student_no"], message: "学生请输入 6 位数字学号，教师请输入工号" });
    }
  });
  const form = useForm<AuthValues>({ resolver: zodResolver(schema), defaultValues: { student_no: "", password: "", name: "" } });
  const mutation = useMutation({
    mutationFn: (values: AuthValues) =>
      api<AuthResponse>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(mode === "register" ? values : { student_no: values.student_no, password: values.password }),
      }),
    onSuccess: (data) => {
      auth.setAuth(data);
      navigate(homeForRole(data.user.role), { replace: true });
    },
  });
  if (auth.user) return <Navigate to={homeForRole(auth.user.role)} replace />;

  return (
    <div className="auth-canvas flex min-h-screen flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="auth-shell mx-auto grid w-full max-w-[1060px] flex-1 overflow-hidden rounded-[22px] bg-white lg:min-h-[660px] lg:grid-cols-[.92fr_1fr]">
        <main className="flex items-center justify-center p-6 sm:p-10 lg:order-2 lg:p-14">
          <div className="page-enter w-full max-w-[400px]">
            <div className="flex items-center justify-between">
              <BrandLogo size="md" showName />
              <span className="rounded-full border border-black/10 bg-[#f5f5f7] px-3 py-1 text-xs font-medium text-muted">
                学生口语角
              </span>
            </div>
            <div className="mt-10">
              <p className="flex items-center gap-1.5 text-sm font-medium text-accent">
                <Sparkles className="h-4 w-4" />
                {mode === "login" ? "欢迎回来" : "认识一下"}
              </p>
              <h1 className="mt-2 text-[32px] font-semibold leading-tight sm:text-[36px]">
                {mode === "login" ? "今天，也大胆开口吧" : "加入 Impromptu，开始表达"}
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted">
                {mode === "register"
                  ? "学生使用 6 位数字学号创建账号，教师账号由系统管理员统一建立。"
                  : "学生使用 6 位数字学号，教师使用学校分配的工号登录。"}
              </p>
            </div>
            <form className="mt-8 space-y-4" onSubmit={form.handleSubmit((data) => mutation.mutate(data))}>
              {mode === "register" && (
                <div>
                  <label className="label">姓名</label>
                  <input className="field" autoComplete="name" placeholder="你的姓名" {...form.register("name")} />
                  {form.formState.errors.name && <p className="mt-1 text-xs text-danger">{form.formState.errors.name.message}</p>}
                </div>
              )}
              <div>
                <label className="label">{mode === "register" ? "6 位数字学号" : "学号 / 教师工号"}</label>
                <input
                  className="field"
                  autoCapitalize={mode === "register" ? "off" : "characters"}
                  autoComplete="username"
                  inputMode={mode === "register" ? "numeric" : "text"}
                  maxLength={mode === "register" ? 6 : 32}
                  placeholder={mode === "register" ? "例如 250001" : "学生例如 250001；教师输入工号"}
                  {...form.register("student_no")}
                />
                {form.formState.errors.student_no && (
                  <p className="mt-1 text-xs text-danger">{form.formState.errors.student_no.message}</p>
                )}
              </div>
              <div>
                <label className="label">密码</label>
                <input
                  className="field"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder="至少 6 位"
                  {...form.register("password")}
                />
                {form.formState.errors.password && <p className="mt-1 text-xs text-danger">{form.formState.errors.password.message}</p>}
              </div>
              {mutation.error && <InlineMessage>{mutation.error.message}</InlineMessage>}
              <Button type="submit" size="lg" className="w-full" loading={mutation.isPending} icon={<ArrowRight className="h-4 w-4" />}>
                {mode === "login" ? "进入 Impromptu" : "注册并进入"}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted">
              {mode === "login" ? "还没有账号？" : "已有账号？"}
              <Link className="ml-1 font-medium text-accent hover:underline" to={mode === "login" ? "/register" : "/login"}>
                {mode === "login" ? "学生注册" : "返回登录"}
              </Link>
            </p>
            {mode === "login" && (
              <Link className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted hover:text-ink" to="/admin/login">
                <ShieldCheck className="h-3.5 w-3.5" />
                系统管理员入口
              </Link>
            )}
          </div>
        </main>
        <aside className="doodle-panel hidden items-center justify-center overflow-hidden p-12 lg:order-1 lg:flex">
          <div className="relative z-10 flex max-w-[350px] flex-col items-center text-center">
            <div className="speech-note mb-10 self-start rounded-[16px] bg-white px-5 py-3 text-left text-sm font-medium leading-6 text-ink">
              <MessageCircle className="mr-2 inline h-4 w-4 text-accent" />
              别怕停顿，先把想法说出来。
            </div>
            <BrandLogo size="xl" className="-rotate-3 transition-transform duration-300 hover:rotate-2" />
            <h2 className="mt-8 text-[28px] font-semibold">声音也是一种作品</h2>
            <p className="mt-3 max-w-xs text-sm leading-7 text-muted">认真准备，自信表达。每一次练习，都会让下一次开口更从容。</p>
            <div className="mt-7 flex items-center gap-2 text-xs font-medium">
              <span className="rounded-full border border-black/10 bg-white px-3 py-1.5">清晰</span>
              <span className="rounded-full border border-black/10 bg-white px-3 py-1.5">自信</span>
              <span className="rounded-full border border-black/10 bg-white px-3 py-1.5">真诚</span>
              <Star className="ml-1 h-4 w-4 text-muted" />
            </div>
          </div>
        </aside>
      </div>
      <IcpFooter className="mx-auto mt-4 max-w-[1060px]" />
    </div>
  );
}
