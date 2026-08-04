import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, AudioLines, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";
import { api } from "../../api/client";
import { AudioDownloadButton, AudioPlayer } from "../../components/common/AudioPlayer";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { ErrorState, InlineMessage, LoadingState } from "../../components/common/States";
import type { TrainingSession } from "../../types";
import { formatDate, formatDuration } from "../../utils/format";

const evaluationSchema = z.object({ content_accuracy: z.coerce.number().min(0).max(20), logical_structure: z.coerce.number().min(0).max(20), fluency: z.coerce.number().min(0).max(20), vocabulary: z.coerce.number().min(0).max(20), time_control: z.coerce.number().min(0).max(20), comment: z.string().max(5000) });
type EvaluationValues = z.infer<typeof evaluationSchema>;
type EvaluationInputs = z.input<typeof evaluationSchema>;

export function EvaluationPage() {
  const { sessionId } = useParams();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["session", Number(sessionId)], queryFn: () => api<TrainingSession>(`/sessions/${sessionId}`) });
  const form = useForm<EvaluationInputs, unknown, EvaluationValues>({ resolver: zodResolver(evaluationSchema), values: query.data ? { content_accuracy: query.data.evaluation?.content_accuracy ?? 16, logical_structure: query.data.evaluation?.logical_structure ?? 16, fluency: query.data.evaluation?.fluency ?? 16, vocabulary: query.data.evaluation?.vocabulary ?? 16, time_control: query.data.evaluation?.time_control ?? 16, comment: query.data.evaluation?.comment ?? "" } : undefined });
  const save = useMutation({ mutationFn: (values: EvaluationValues) => api<TrainingSession>(`/sessions/${sessionId}/evaluation`, { method: "PUT", body: JSON.stringify(values) }), onSuccess: (data) => client.setQueryData(["session", Number(sessionId)], data) });
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState message={query.error?.message} retry={() => query.refetch()} />;
  const session = query.data;
  const recording = session.recordings.find((item) => item.is_selected) || session.recordings[0];
  const values = form.watch();
  const total = Number(values.content_accuracy || 0) + Number(values.logical_structure || 0) + Number(values.fluency || 0) + Number(values.vocabulary || 0) + Number(values.time_control || 0);
  const seconds = session.speaking_started_at && session.speaking_finished_at ? (new Date(session.speaking_finished_at).getTime() - new Date(session.speaking_started_at).getTime()) / 1000 : 0;
  return <div className="page-enter mx-auto max-w-6xl"><Link to={`/teacher/tasks/${session.task_id}/submissions`} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted"><ArrowLeft className="h-4 w-4" />返回提交列表</Link><div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]"><section className="surface h-fit overflow-hidden"><div className="border-b border-black/[.06] p-6"><div className="flex items-center gap-2"><Badge tone="blue">{session.student_name}</Badge><span className="text-xs text-muted">{session.student_no} · {formatDate(session.submitted_at)}</span></div><h1 className="mt-5 text-xl font-semibold leading-8">{session.final_topic?.prompt}</h1><p className="mt-2 text-xs text-muted">实际表达 {formatDuration(seconds)}</p></div><div className="p-6"><h2 className="flex items-center gap-2 text-sm font-semibold"><AudioLines className="h-4 w-4" />演讲录音</h2>{recording ? <AudioPlayer className="mt-4" src={recording.stream_url} durationHint={recording.duration_seconds || seconds} /> : <p className="mt-3 text-sm text-danger">录音文件不可用。</p>}{recording && <AudioDownloadButton className="mt-3" src={recording.download_url} filename={`speaking-${recording.id}.mp4`} />}<h2 className="mt-8 text-sm font-semibold">准备笔记</h2><div className="mt-3 min-h-36 whitespace-pre-wrap rounded-[12px] bg-black/[.03] p-4 text-sm leading-6 text-muted">{session.note || "未填写"}</div><h2 className="mt-7 text-sm font-semibold">学生自评</h2><p className="mt-3 text-sm leading-6 text-muted">{session.self_assessment || "未填写"}</p></div></section>
      <form className="surface p-6" onSubmit={form.handleSubmit((values) => save.mutate(values))}><div className="flex items-center justify-between"><div><h2 className="section-title">教师评价</h2><p className="mt-1 text-xs text-muted">每项满分 20 分</p></div><div className="text-right"><p className="text-3xl font-semibold tabular-nums">{total}</p><p className="text-[11px] text-muted">总分 / 100</p></div></div><div className="mt-6 space-y-3"><ScoreField label="内容准确性" name="content_accuracy" register={form.register} value={values.content_accuracy} /><ScoreField label="逻辑结构" name="logical_structure" register={form.register} value={values.logical_structure} /><ScoreField label="表达流利度" name="fluency" register={form.register} value={values.fluency} /><ScoreField label="词汇使用" name="vocabulary" register={form.register} value={values.vocabulary} /><ScoreField label="时间控制" name="time_control" register={form.register} value={values.time_control} /></div><label className="mt-6 block text-sm font-medium">总评</label><textarea className="field mt-2 min-h-36 resize-none leading-6" {...form.register("comment")} placeholder="指出具体优点，并给出下一次可执行的改进建议。" />{save.error && <div className="mt-4"><InlineMessage>{save.error.message}</InlineMessage></div>}{save.isSuccess && <div className="mt-4"><InlineMessage type="success">评价已发布，学生现在可以查看。</InlineMessage></div>}<Button type="submit" size="lg" className="mt-5 w-full" loading={save.isPending} icon={<Send className="h-4 w-4" />}>{session.evaluation ? "更新评价" : "发布评价"}</Button></form></div></div>;
}

function ScoreField({ label, name, register, value }: { label: string; name: keyof EvaluationValues; register: ReturnType<typeof useForm<EvaluationInputs>>["register"]; value: unknown }) { return <label className="grid grid-cols-[1fr_48px] items-center gap-3 rounded-[12px] border border-black/[.07] p-3"><span><span className="block text-sm font-medium">{label}</span><input className="mt-2 h-1.5 w-full cursor-pointer accent-accent" type="range" min="0" max="20" {...register(name)} /></span><span className="grid h-10 place-items-center rounded-[9px] bg-black/[.04] text-sm font-semibold tabular-nums">{String(value ?? 0)}</span></label>; }
