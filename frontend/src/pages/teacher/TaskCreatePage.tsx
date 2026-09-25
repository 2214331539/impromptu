import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send } from "lucide-react";
import { useEffect, useRef } from "react";
import { cacheKey, readCache, writeCache, removeCache, rememberTask, forgetTask } from "../../utils/taskCache";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { api } from "../../api/client";
import { Button } from "../../components/common/Button";
import { ErrorState, InlineMessage, LoadingState } from "../../components/common/States";
import type { ClassRoom, Task, TopicBank } from "../../types";

const schema = z.object({
  name: z.string().min(2, "请输入任务名称"), description: z.string(), class_id: z.coerce.number().positive("请选择班级"), topic_bank_id: z.coerce.number().positive("请选择题库"),
  research_seconds: z.coerce.number().min(10).max(7200), preparation_seconds: z.coerce.number().min(10).max(3600), speaking_seconds: z.coerce.number().min(10).max(3600), starts_at: z.string().min(1), due_at: z.string().min(1),
  redraw_limit: z.coerce.number().min(0).max(10), rerecord_limit: z.coerce.number().min(0).max(10), allow_early_finish: z.boolean(),
}).refine((data) => new Date(data.due_at) > new Date(data.starts_at), { message: "截止时间必须晚于开始时间", path: ["due_at"] });
type Values = z.infer<typeof schema>;
type InputValues = z.input<typeof schema>;

function localDate(offsetDays: number) { const d = new Date(Date.now() + offsetDays * 86400000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }

export function TaskCreatePage() {
  const { taskId } = useParams();
  return <TaskCreatePageContent key={taskId || "new"} />;
}

function TaskCreatePageContent() {
  const navigate = useNavigate();
  const { taskId } = useParams();
  const client = useQueryClient();
  const path = taskId ? `/teacher/tasks/${taskId}/edit` : "/teacher/tasks/new";
  const key = cacheKey(`task-form:${taskId || "new"}`);
  const loaded = useRef(false);
  const existing = useQuery({ queryKey: ["task", taskId], queryFn: () => api<Task>(`/tasks/${taskId}`), enabled: !!taskId });
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<ClassRoom[]>("/classes") });
  const banks = useQuery({ queryKey: ["topic-banks"], queryFn: () => api<TopicBank[]>("/topic-banks") });
  const form = useForm<InputValues, unknown, Values>({ resolver: zodResolver(schema), defaultValues: { name: "", description: "", class_id: 0, topic_bank_id: 0, research_seconds: 900, preparation_seconds: 60, speaking_seconds: 180, starts_at: localDate(0), due_at: localDate(7), redraw_limit: 1, rerecord_limit: 1, allow_early_finish: false } });
  useEffect(() => {
    if (loaded.current || (taskId && !existing.data)) return;
    const cached = readCache<Values>(key);
    if (cached) form.reset(cached);
    else if (existing.data) {
      const task = existing.data;
      const local = (value: string) => { const d = new Date(value); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
      form.reset({ ...task, starts_at: local(task.starts_at), due_at: local(task.due_at) });
    }
    loaded.current = true;
  }, [existing.data, taskId, key, form]);
  useEffect(() => {
    const subscription = form.watch((value) => { if (loaded.current) { writeCache(key, value); rememberTask(path, value.name || "口语任务编辑草稿"); } });
    return () => subscription.unsubscribe();
  }, [form, key, path]);
  const create = useMutation({ mutationFn: (values: Values) => api<Task>(taskId ? `/tasks/${taskId}` : "/tasks", { method: taskId ? "PUT" : "POST", body: JSON.stringify({ ...values, notes_required: existing.data?.notes_required ?? false, starts_at: new Date(values.starts_at).toISOString(), due_at: new Date(values.due_at).toISOString() }) }), onSuccess: async () => { loaded.current = false; removeCache(key); forgetTask(path); await Promise.all([client.invalidateQueries({ queryKey: ["tasks"] }), client.invalidateQueries({ queryKey: ["task"] }), client.invalidateQueries({ queryKey: ["dashboard"] })]); navigate("/teacher/tasks"); } });
  if (classes.isLoading || banks.isLoading || (taskId && existing.isLoading)) return <LoadingState />;
  if (classes.isError || banks.isError || existing.isError) return <ErrorState message={classes.error?.message || banks.error?.message || existing.error?.message} />;
  const noResources = !classes.data?.length || !banks.data?.length;
  return <div className="page-enter mx-auto max-w-4xl"><Link to="/teacher/tasks" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted"><ArrowLeft className="h-4 w-4" />返回口语任务</Link><header className="mb-7"><h1 className="page-title">{taskId ? "编辑口语任务" : "创建口语任务"}</h1><p className="mt-2 text-sm text-muted">设置训练范围、时间规则与提交要求。输入会在本机自动缓存。已有训练时不能更换班级或题库，已开始阶段的倒计时保持不变。</p></header>
    {noResources ? <ErrorState message="创建任务前，需要至少一个班级和一个包含启用题目的题库。" /> : <form onSubmit={form.handleSubmit((values) => create.mutate(values))} className="surface overflow-hidden"><section className="border-b border-black/[.06] p-6 sm:p-8"><h2 className="section-title">基本信息</h2><div className="mt-5 space-y-4"><Field label="任务名称" error={form.formState.errors.name?.message}><input className="field" {...form.register("name")} placeholder="例如 Week 4 · Storytelling" /></Field><Field label="任务说明"><textarea className="field min-h-28 resize-none leading-6" {...form.register("description")} placeholder="说明训练目标和表达要求" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="目标班级" error={form.formState.errors.class_id?.message}><select className="field" {...form.register("class_id")}><option value={0}>请选择</option>{classes.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="使用题库" error={form.formState.errors.topic_bank_id?.message}><select className="field" {...form.register("topic_bank_id")}><option value={0}>请选择</option>{banks.data?.map((item) => <option key={item.id} value={item.id}>{item.name}（{item.active_topic_count} 题）</option>)}</select></Field></div></div></section>
      <section className="border-b border-black/[.06] p-6 sm:p-8"><h2 className="section-title">时间与次数</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="资料搜集时间（秒）"><input type="number" className="field" {...form.register("research_seconds")} /></Field><Field label="准备整理时间（秒）"><input type="number" className="field" {...form.register("preparation_seconds")} /></Field><Field label="演讲时间（秒）"><input type="number" className="field" {...form.register("speaking_seconds")} /></Field><Field label="开始时间"><input type="datetime-local" className="field" {...form.register("starts_at")} /></Field><Field label="截止时间" error={form.formState.errors.due_at?.message}><input type="datetime-local" className="field" {...form.register("due_at")} /></Field><Field label="重新抽题次数"><input type="number" className="field" {...form.register("redraw_limit")} /></Field><Field label="重新录制次数"><input type="number" className="field" {...form.register("rerecord_limit")} /></Field></div></section>
      <section className="p-6 sm:p-8"><h2 className="section-title">提交规则</h2><div className="mt-5 space-y-3"><Toggle label="允许提前结束准备" {...form.register("allow_early_finish")} /></div>{create.error && <div className="mt-5"><InlineMessage>{create.error.message}</InlineMessage></div>}<div className="mt-7 flex justify-end gap-2"><Link to="/teacher/tasks"><Button type="button" variant="ghost">取消</Button></Link><Button type="submit" loading={create.isPending} icon={<Send className="h-4 w-4" />}>{taskId ? "保存修改" : "创建为草稿"}</Button></div></section>
    </form>}
  </div>;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { return <label className="block"><span className="label">{label}</span>{children}{error && <span className="mt-1 block text-xs text-danger">{error}</span>}</label>; }
function Toggle({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className="flex cursor-pointer items-center justify-between rounded-[12px] border border-black/[.07] bg-white p-3.5 text-sm"><span>{label}</span><input type="checkbox" className="h-4 w-4 accent-accent" {...props} /></label>; }
