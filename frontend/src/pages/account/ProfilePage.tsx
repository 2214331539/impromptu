import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, Mail, ShieldAlert, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "../../api/client";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { InlineMessage } from "../../components/common/States";
import { useAuthStore } from "../../stores/auth";
import type { User } from "../../types";

const emailSchema = z.object({
  email: z.string().email("请输入正确的邮箱"),
  email_code: z.string().length(6, "验证码为 6 位数字").regex(/^\d{6}$/, "验证码为 6 位数字"),
});
type EmailValues = z.infer<typeof emailSchema>;

const passwordSchema = z
  .object({
    current_password: z.string().min(6, "请输入当前密码").max(72),
    new_password: z.string().min(6, "新密码至少 6 位").max(72),
    confirm_password: z.string().min(6, "请再次输入新密码").max(72),
  })
  .superRefine((values, context) => {
    if (values.new_password !== values.confirm_password) {
      context.addIssue({ code: "custom", path: ["confirm_password"], message: "两次输入的新密码不一致" });
    }
  });
type PasswordValues = z.infer<typeof passwordSchema>;

const CODE_COOLDOWN_SECONDS = 60;

export function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: user?.email || "", email_code: "" },
  });
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });
  const email = emailForm.watch("email");
  const canSendCode = z.string().email().safeParse(email).success && codeCooldown === 0;

  const sendCode = useMutation({
    mutationFn: () => api<void>("/auth/email-code", { method: "POST", body: JSON.stringify({ email: emailForm.getValues("email") }) }),
    onSuccess: () => setCodeCooldown(CODE_COOLDOWN_SECONDS),
  });
  const bindEmail = useMutation({
    mutationFn: (values: EmailValues) => api<User>("/auth/bind-email", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: async (updated) => {
      setUser(updated);
      emailForm.reset({ email: updated.email || "", email_code: "" });
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
  const changePassword = useMutation({
    mutationFn: (values: PasswordValues) =>
      api<void>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: values.current_password,
          new_password: values.new_password,
        }),
      }),
    onSuccess: () => {
      setPasswordSaved(true);
      passwordForm.reset();
    },
  });

  useEffect(() => {
    if (codeCooldown <= 0) return;
    const timer = window.setTimeout(() => setCodeCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [codeCooldown]);

  if (!user) return null;
  const emailReady = !!user.email && user.email_verified;

  return (
    <div className="page-enter space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">个人主页</p>
          <h1 className="page-title mt-2">{user.name}</h1>
          <p className="mt-2 text-[15px] text-muted">管理登录密码和用于找回密码的安全邮箱。</p>
        </div>
        <Badge tone={emailReady ? "green" : "orange"}>{emailReady ? "邮箱已验证" : "待绑定邮箱"}</Badge>
      </header>

      {!emailReady && (
        <section className="rounded-[18px] border border-orange-200 bg-orange-50 p-5 text-[#8a5a18]">
          <div className="flex gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h2 className="font-medium">请绑定邮箱</h2>
              <p className="mt-1 text-sm leading-6">当前账号还不能通过邮箱找回密码。完成邮箱验证后，忘记密码时可以在登录页重置。</p>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[.82fr_1.18fr]">
        <div className="surface p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-black/[.04] text-muted">
              <UserRound className="h-5 w-5" />
            </span>
            <div>
              <h2 className="section-title">账号信息</h2>
              <p className="mt-1 text-xs text-muted">基础身份信息由系统保存。</p>
            </div>
          </div>
          <dl className="mt-6 space-y-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">账号</dt>
              <dd className="font-medium">{user.student_no}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">角色</dt>
              <dd className="font-medium">{user.role === "admin" ? "系统管理员" : user.role === "teacher" ? "教师" : "学生"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">邮箱</dt>
              <dd className="max-w-[220px] truncate font-medium">{user.email || "未绑定"}</dd>
            </div>
          </dl>
        </div>

        <form className="surface p-5" onSubmit={emailForm.handleSubmit((values) => bindEmail.mutate(values))}>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-blue-50 text-accent">
              <Mail className="h-5 w-5" />
            </span>
            <div>
              <h2 className="section-title">绑定邮箱</h2>
              <p className="mt-1 text-xs text-muted">一个邮箱只能绑定一个账号。</p>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            <div>
              <label className="label">邮箱地址</label>
              <input className="field" type="email" autoComplete="email" placeholder="name@example.com" {...emailForm.register("email")} />
              {emailForm.formState.errors.email && <p className="mt-1 text-xs text-danger">{emailForm.formState.errors.email.message}</p>}
            </div>
            <div>
              <label className="label">邮箱验证码</label>
              <div className="flex gap-2">
                <input className="field" inputMode="numeric" maxLength={6} placeholder="6 位验证码" {...emailForm.register("email_code")} />
                <Button type="button" variant="secondary" disabled={!canSendCode} loading={sendCode.isPending} onClick={() => sendCode.mutate()} icon={<Mail className="h-4 w-4" />}>
                  {codeCooldown > 0 ? `${codeCooldown}s` : "发送"}
                </Button>
              </div>
              {emailForm.formState.errors.email_code && <p className="mt-1 text-xs text-danger">{emailForm.formState.errors.email_code.message}</p>}
            </div>
            {sendCode.isSuccess && <InlineMessage type="success">验证码已发送，10 分钟内有效。</InlineMessage>}
            {sendCode.error && <InlineMessage>{sendCode.error.message}</InlineMessage>}
            {bindEmail.error && <InlineMessage>{bindEmail.error.message}</InlineMessage>}
            {bindEmail.isSuccess && (
              <InlineMessage type="success">
                <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />邮箱已绑定并验证。</span>
              </InlineMessage>
            )}
            <Button type="submit" loading={bindEmail.isPending} icon={<CheckCircle2 className="h-4 w-4" />}>
              保存邮箱
            </Button>
          </div>
        </form>
      </section>

      <form className="surface max-w-2xl p-5" onSubmit={passwordForm.handleSubmit((values) => changePassword.mutate(values))}>
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-black/[.04] text-muted">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <h2 className="section-title">修改密码</h2>
            <p className="mt-1 text-xs text-muted">修改后请使用新密码重新登录。</p>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">当前密码</label>
            <input className="field" type="password" autoComplete="current-password" {...passwordForm.register("current_password")} />
            {passwordForm.formState.errors.current_password && <p className="mt-1 text-xs text-danger">{passwordForm.formState.errors.current_password.message}</p>}
          </div>
          <div>
            <label className="label">新密码</label>
            <input className="field" type="password" autoComplete="new-password" {...passwordForm.register("new_password")} />
            {passwordForm.formState.errors.new_password && <p className="mt-1 text-xs text-danger">{passwordForm.formState.errors.new_password.message}</p>}
          </div>
          <div>
            <label className="label">确认新密码</label>
            <input className="field" type="password" autoComplete="new-password" {...passwordForm.register("confirm_password")} />
            {passwordForm.formState.errors.confirm_password && <p className="mt-1 text-xs text-danger">{passwordForm.formState.errors.confirm_password.message}</p>}
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {changePassword.error && <InlineMessage>{changePassword.error.message}</InlineMessage>}
          {passwordSaved && <InlineMessage type="success">密码已更新。</InlineMessage>}
          <Button type="submit" loading={changePassword.isPending} icon={<KeyRound className="h-4 w-4" />}>
            保存新密码
          </Button>
        </div>
      </form>
    </div>
  );
}
