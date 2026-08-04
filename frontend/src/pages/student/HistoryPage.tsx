import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, AudioLines, MessageSquareText } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { AudioDownloadButton, AudioPlayer } from "../../components/common/AudioPlayer";
import { Badge } from "../../components/common/Badge";
import { EmptyState, ErrorState, LoadingState } from "../../components/common/States";
import type { TrainingSession } from "../../types";
import { formatDate, formatDuration, phaseLabel } from "../../utils/format";

export function HistoryPage() {
  const { sessionId } = useParams();
  const query = useQuery({ queryKey: ["history"], queryFn: () => api<TrainingSession[]>("/sessions/history") });
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState message={query.error.message} retry={() => query.refetch()} />;
  if (sessionId) {
    const session = query.data?.find((item) => item.id === Number(sessionId));
    if (!session) return <ErrorState message="训练记录不存在" />;
    return <HistoryDetail session={session} />;
  }
  const sessions = query.data || [];
  return <div className="page-enter"><header className="mb-8"><h1 className="page-title">训练记录</h1><p className="mt-2 text-sm text-muted">回听表达，查看评分与教师建议。</p></header>
    {sessions.length ? <div className="surface divide-y divide-black/[.06] overflow-hidden">{sessions.map((s) => <Link key={s.id} to={`/app/history/${s.id}`} className="grid gap-3 p-5 hover:bg-black/[.018] sm:grid-cols-[1fr_auto] sm:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate font-medium">{s.task.name}</h2><Badge tone={s.evaluation ? "green" : s.phase === "submitted" ? "blue" : "orange"}>{s.evaluation ? `${s.evaluation.total_score} 分` : phaseLabel[s.phase]}</Badge></div><p className="mt-2 truncate text-sm text-muted">{s.final_topic?.prompt || "尚未确认题目"}</p></div><div className="text-xs text-muted">{formatDate(s.submitted_at || s.server_time)}</div></Link>)}</div> : <EmptyState title="还没有训练记录" description="开始第一项口语任务后，记录会保存在这里。" />}
  </div>;
}

function HistoryDetail({ session }: { session: TrainingSession }) {
  const recording = session.recordings.find((x) => x.is_selected) || session.recordings[0];
  const speakingSeconds = session.speaking_started_at && session.speaking_finished_at ? (new Date(session.speaking_finished_at).getTime() - new Date(session.speaking_started_at).getTime()) / 1000 : session.task.speaking_seconds;
  return <div className="page-enter mx-auto max-w-4xl"><Link to="/app/history" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted"><ArrowLeft className="h-4 w-4" />返回记录</Link>
    <div className="surface overflow-hidden"><div className="border-b border-black/[.07] p-6 sm:p-8"><div className="flex items-center gap-2"><Badge tone={session.evaluation ? "green" : "blue"}>{session.evaluation ? `${session.evaluation.total_score} 分` : phaseLabel[session.phase]}</Badge><span className="text-xs text-muted">{formatDate(session.submitted_at)}</span></div><h1 className="mt-5 text-2xl font-semibold leading-9">{session.final_topic?.prompt}</h1><p className="mt-3 text-sm text-muted">准备 {formatDuration(session.task.preparation_seconds)} · 实际表达 {formatDuration(speakingSeconds)}</p></div>
    <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-2"><section><h2 className="flex items-center gap-2 text-sm font-semibold"><AudioLines className="h-4 w-4" />演讲录音</h2>{recording ? <AudioPlayer className="mt-4" src={recording.stream_url} durationHint={recording.duration_seconds || speakingSeconds} /> : <p className="mt-4 text-sm text-muted">没有可播放的录音。</p>}{recording && <AudioDownloadButton className="mt-3" src={recording.download_url} filename={`speaking-${recording.id}.mp4`} />}<h2 className="mt-8 text-sm font-semibold">准备笔记</h2><div className="mt-3 min-h-32 whitespace-pre-wrap rounded-[12px] bg-black/[.03] p-4 text-sm leading-6 text-muted">{session.note || "未填写笔记"}</div></section>
        <section><h2 className="flex items-center gap-2 text-sm font-semibold"><MessageSquareText className="h-4 w-4" />教师反馈</h2>{session.evaluation ? <><div className="mt-4 grid grid-cols-2 gap-2">{[["内容准确",session.evaluation.content_accuracy],["逻辑结构",session.evaluation.logical_structure],["表达流利",session.evaluation.fluency],["词汇使用",session.evaluation.vocabulary],["时间控制",session.evaluation.time_control]].map(([label,score]) => <div key={label} className="rounded-[11px] border border-black/[.07] bg-white p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 font-semibold">{score}<span className="text-xs font-normal text-muted"> / 20</span></p></div>)}</div><p className="mt-4 rounded-[12px] bg-green-50/70 p-4 text-sm leading-6 text-ink">{session.evaluation.comment || "教师未填写文字评语。"}</p></> : <div className="mt-4 rounded-[12px] bg-black/[.03] p-5 text-sm text-muted">教师尚未发布评价。</div>}<h2 className="mt-8 text-sm font-semibold">自我评价</h2><p className="mt-3 text-sm leading-6 text-muted">{session.self_assessment || "未填写"}</p></section></div>
    </div>
  </div>;
}
