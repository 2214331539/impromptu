import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Mail, MessageCircle, ShieldCheck, Sparkles, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { api } from "../../api/client";
import { BrandLogo } from "../../components/common/BrandLogo";
import { Button } from "../../components/common/Button";
import { IcpFooter } from "../../components/common/IcpFooter";
import { Modal } from "../../components/common/Modal";
import { InlineMessage } from "../../components/common/States";
import { useAuthStore } from "../../stores/auth";
import type { AuthResponse } from "../../types";
import { homeForRole } from "../../utils/auth";

const accountSchema = z.string().min(3, "账号至少 3 位").max(32, "账号最多 32 位").regex(/^[A-Za-z0-9_-]+$/, "账号只能包含字母、数字、下划线和短横线");

const loginSchema = z.object({
  student_no: accountSchema,
  password: z.string().min(6, "密码至少 6 位"),
});

const registerSchema = z.object({
  student_no: z.string().min(3, "账号至少 3 位").max(32, "账号最多 32 位").regex(/^[A-Za-z0-9_-]+$/, "账号只能包含字母、数字、下划线和短横线"),
  email: z.string().email("请输入正确的邮箱"),
  email_code: z.string().length(6, "请输入 6 位邮箱验证码").regex(/^\d{6}$/, "请输入 6 位邮箱验证码"),
  password: z.string().min(6, "密码至少 6 位"),
  name: z.string().min(2, "请输入姓名"),
});
type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;
type AuthValues = LoginValues & Partial<Omit<RegisterValues, keyof LoginValues>>;

const resetSchema = z.object({
  student_no: z.string().min(3, "请输入账号").max(32),
  email: z.string().email("请输入正确的邮箱"),
  email_code: z.string().length(6, "验证码为 6 位数字").regex(/^\d{6}$/, "验证码为 6 位数字"),
  new_password: z.string().min(6, "新密码至少 6 位").max(72),
});
type ResetValues = z.infer<typeof resetSchema>;
const CODE_COOLDOWN_SECONDS = 60;

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const auth = useAuthStore();
  const navigate = useNavigate();
  const [resetOpen, setResetOpen] = useState(false);
  const [registerCodeCooldown, setRegisterCodeCooldown] = useState(0);
  const [resetCodeCooldown, setResetCodeCooldown] = useState(0);
  const form = useForm<AuthValues>({
    resolver: zodResolver(mode === "register" ? registerSchema : loginSchema),
    defaultValues: { student_no: "", email: "", email_code: "", password: "", name: "" },
  });
  const resetForm = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { student_no: "", email: "", email_code: "", new_password: "" } });
  const registerAccount = form.watch("student_no");
  const registerEmail = form.watch("email");
  const resetAccount = resetForm.watch("student_no");
  const resetEmail = resetForm.watch("email");
  const canSendRegisterCode = /^[A-Za-z0-9_-]{3,32}$/.test(registerAccount || "") && !!registerEmail && z.string().email().safeParse(registerEmail).success && registerCodeCooldown === 0;
  const canSendResetCode = resetAccount.trim().length >= 3 && z.string().email().safeParse(resetEmail).success && resetCodeCooldown === 0;
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
  const registerCode = useMutation({
    mutationFn: () => api<void>("/auth/register/email-code", {
      method: "POST",
      body: JSON.stringify({ student_no: form.getValues("student_no"), email: form.getValues("email") }),
    }),
    onSuccess: () => setRegisterCodeCooldown(CODE_COOLDOWN_SECONDS),
  });
  const resetCode = useMutation({
    mutationFn: () => api<void>("/auth/password-reset/email-code", {
      method: "POST",
      body: JSON.stringify({ student_no: resetForm.getValues("student_no"), email: resetForm.getValues("email") }),
    }),
    onSuccess: () => setResetCodeCooldown(CODE_COOLDOWN_SECONDS),
  });
  const resetPassword = useMutation({
    mutationFn: (values: ResetValues) => api<void>("/auth/password-reset", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: () => {
      setResetOpen(false);
      resetForm.reset();
    },
  });
  useEffect(() => {
    if (registerCodeCooldown <= 0) return;
    const timer = window.setTimeout(() => setRegisterCodeCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [registerCodeCooldown]);
  useEffect(() => {
    if (resetCodeCooldown <= 0) return;
    const timer = window.setTimeout(() => setResetCodeCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resetCodeCooldown]);
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
                  ? "学生使用账号、邮箱和密码注册，完成邮箱验证后即可登录。"
                  : "学生和教师使用账号密码登录，忘记密码可通过绑定邮箱找回。"}
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
                <label className="label">账号</label>
                <input
                  className="field"
                  autoCapitalize="characters"
                  autoComplete="username"
                  inputMode="text"
                  maxLength={32}
                  placeholder={mode === "register" ? "例如 STU2501" : "输入账号"}
                  {...form.register("student_no")}
                />
                {form.formState.errors.student_no && (
                  <p className="mt-1 text-xs text-danger">{form.formState.errors.student_no.message}</p>
                )}
              </div>
              {mode === "register" && (
                <>
                  <div>
                    <label className="label">邮箱</label>
                    <input className="field" type="email" autoComplete="email" placeholder="name@example.com" {...form.register("email")} />
                    {form.formState.errors.email && <p className="mt-1 text-xs text-danger">{form.formState.errors.email.message}</p>}
                  </div>
                  <div>
                    <label className="label">邮箱验证码</label>
                    <div className="flex gap-2">
                      <input className="field" inputMode="numeric" maxLength={6} placeholder="6 位验证码" {...form.register("email_code")} />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!canSendRegisterCode}
                        loading={registerCode.isPending}
                        onClick={() => registerCode.mutate()}
                        icon={<Mail className="h-4 w-4" />}
                      >
                        {registerCodeCooldown > 0 ? `${registerCodeCooldown}s` : "发送"}
                      </Button>
                    </div>
                    {form.formState.errors.email_code && <p className="mt-1 text-xs text-danger">{form.formState.errors.email_code.message}</p>}
                    {registerCode.isSuccess && <p className="mt-1 text-xs text-success">验证码已发送，10 分钟内有效。</p>}
                    {registerCode.error && <p className="mt-1 text-xs text-danger">{registerCode.error.message}</p>}
                  </div>
                </>
              )}
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
              <div className="mt-4 flex items-center justify-center gap-4 text-xs">
                <button type="button" className="text-muted hover:text-ink" onClick={() => setResetOpen(true)}>
                  忘记密码
                </button>
                <Link className="flex items-center gap-1.5 text-muted hover:text-ink" to="/admin/login">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  系统管理员入口
                </Link>
              </div>
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
      <Modal
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          resetForm.reset();
        }}
        title="找回密码"
      >
        <form className="space-y-4" onSubmit={resetForm.handleSubmit((values) => resetPassword.mutate(values))}>
          <div>
            <label className="label">账号</label>
            <input className="field" autoComplete="username" placeholder="输入账号" {...resetForm.register("student_no")} />
            {resetForm.formState.errors.student_no && <p className="mt-1 text-xs text-danger">{resetForm.formState.errors.student_no.message}</p>}
          </div>
          <div>
            <label className="label">绑定邮箱</label>
            <input className="field" type="email" autoComplete="email" placeholder="name@example.com" {...resetForm.register("email")} />
            {resetForm.formState.errors.email && <p className="mt-1 text-xs text-danger">{resetForm.formState.errors.email.message}</p>}
          </div>
          <div>
            <label className="label">邮箱验证码</label>
            <div className="flex gap-2">
              <input className="field" inputMode="numeric" maxLength={6} placeholder="6 位验证码" {...resetForm.register("email_code")} />
              <Button type="button" variant="secondary" disabled={!canSendResetCode} loading={resetCode.isPending} onClick={() => resetCode.mutate()} icon={<Mail className="h-4 w-4" />}>
                {resetCodeCooldown > 0 ? `${resetCodeCooldown}s` : "发送"}
              </Button>
            </div>
            {resetForm.formState.errors.email_code && <p className="mt-1 text-xs text-danger">{resetForm.formState.errors.email_code.message}</p>}
            {resetCode.isSuccess && <p className="mt-1 text-xs text-success">验证码已发送，10 分钟内有效。</p>}
            {resetCode.error && <p className="mt-1 text-xs text-danger">{resetCode.error.message}</p>}
          </div>
          <div>
            <label className="label">新密码</label>
            <input className="field" type="password" autoComplete="new-password" placeholder="至少 6 位" {...resetForm.register("new_password")} />
            {resetForm.formState.errors.new_password && <p className="mt-1 text-xs text-danger">{resetForm.formState.errors.new_password.message}</p>}
          </div>
          {resetPassword.error && <InlineMessage>{resetPassword.error.message}</InlineMessage>}
          {resetPassword.isSuccess && <InlineMessage type="success">密码已重置，请使用新密码登录。</InlineMessage>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setResetOpen(false)}>
              取消
            </Button>
            <Button type="submit" loading={resetPassword.isPending}>
              重置密码
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
