import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, ShieldCheck } from "lucide-react";
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

const schema = z.object({
  student_no: z.string().min(3, "请输入管理员账号"),
  password: z.string().min(6, "密码至少 6 位"),
});
type Values = z.infer<typeof schema>;

export function AdminLoginPage() {
  const auth = useAuthStore();
  const navigate = useNavigate();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { student_no: "", password: "" } });
  const login = useMutation({
    mutationFn: (values: Values) =>
      api<AuthResponse>("/admin/auth/login", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: (response) => {
      auth.setAuth(response);
      navigate("/admin", { replace: true });
    },
  });
  if (auth.user) return <Navigate to={homeForRole(auth.user.role)} replace />;

  return (
    <div className="auth-canvas flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <main className="auth-shell page-enter w-full max-w-[440px] rounded-[20px] bg-white p-7 sm:p-10">
        <div className="flex items-center justify-between">
          <BrandLogo size="md" showName />
          <span className="flex items-center gap-1.5 rounded-full border border-black/10 bg-[#f5f5f7] px-3 py-1 text-xs text-muted">
            <ShieldCheck className="h-4 w-4" />
            系统管理
          </span>
        </div>
        <div className="mt-10">
          <p className="text-sm font-medium text-accent">管理员入口</p>
          <h1 className="mt-2 text-[30px] font-semibold">登录系统控制台</h1>
          <p className="mt-2 text-sm leading-6 text-muted">管理教师账号、管理员账号与全校班级。</p>
        </div>
        <form className="mt-8 space-y-4" onSubmit={form.handleSubmit((values) => login.mutate(values))}>
          <div>
            <label className="label">管理员账号</label>
            <input
              className="field"
              autoComplete="username"
              autoCapitalize="characters"
              placeholder="管理员账号"
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
              autoComplete="current-password"
              placeholder="输入密码"
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <p className="mt-1 text-xs text-danger">{form.formState.errors.password.message}</p>
            )}
          </div>
          {login.error && <InlineMessage>{login.error.message}</InlineMessage>}
          <Button type="submit" size="lg" className="w-full" loading={login.isPending} icon={<ArrowRight className="h-4 w-4" />}>
            进入管理控制台
          </Button>
        </form>
        <Link to="/login" className="mt-6 block text-center text-sm text-muted hover:text-ink">
          返回学生 / 教师登录
        </Link>
      </main>
      <IcpFooter className="mt-4 max-w-[440px]" />
    </div>
  );
}
