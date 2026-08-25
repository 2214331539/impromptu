import { useMutation } from "@tanstack/react-query";
import { FileSpreadsheet, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../api/client";
import { Button } from "../../components/common/Button";
import { Modal } from "../../components/common/Modal";
import { InlineMessage } from "../../components/common/States";
import type { Difficulty, TopicBank, TopicImportCommit, TopicImportItem, TopicImportPreview } from "../../types";

const emptyTopic: TopicImportItem = {
  prompt: "",
  category: "General",
  difficulty: "medium",
  tags: "",
};

export function AiTopicImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (bank: TopicBank) => void;
}) {
  const [step, setStep] = useState<"source" | "preview">("source");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rawText, setRawText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [topics, setTopics] = useState<TopicImportItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const canPreview = rawText.trim().length >= 10 || !!file;
  const canCommit = name.trim().length >= 2 && topics.some((topic) => topic.prompt.trim().length >= 5 && topic.category.trim());
  const validCount = useMemo(
    () => topics.filter((topic) => topic.prompt.trim().length >= 5 && topic.category.trim()).length,
    [topics],
  );

  const reset = () => {
    setStep("source");
    setName("");
    setDescription("");
    setRawText("");
    setFile(null);
    setTopics([]);
    setWarnings([]);
  };

  const close = () => {
    reset();
    onClose();
  };

  const preview = useMutation({
    mutationFn: () => {
      const data = new FormData();
      if (name.trim()) data.append("name", name.trim());
      if (description.trim()) data.append("description", description.trim());
      if (rawText.trim()) data.append("raw_text", rawText.trim());
      if (file) data.append("file", file);
      return api<TopicImportPreview>("/topic-banks/import-preview", { method: "POST", body: data });
    },
    onSuccess: (result) => {
      setName(result.name);
      setDescription(result.description);
      setTopics(result.topics.length ? result.topics : [emptyTopic]);
      setWarnings(result.warnings || []);
      setStep("preview");
    },
  });

  const commit = useMutation({
    mutationFn: () =>
      api<TopicImportCommit>("/topic-banks/import-commit", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          topics: topics
            .filter((topic) => topic.prompt.trim().length >= 5 && topic.category.trim())
            .map((topic) => ({
              prompt: topic.prompt.trim(),
              category: topic.category.trim(),
              difficulty: topic.difficulty,
              tags: topic.tags.trim(),
            })),
        }),
      }),
    onSuccess: (result) => {
      onImported(result.bank);
      close();
    },
  });

  const updateTopic = (index: number, patch: Partial<TopicImportItem>) => {
    setTopics((items) => items.map((item, current) => (current === index ? { ...item, ...patch } : item)));
  };

  const removeTopic = (index: number) => {
    setTopics((items) => items.filter((_, current) => current !== index));
  };

  return (
    <Modal open={open} onClose={close} title="AI 导入题库" size="lg">
      {step === "source" ? (
        <div className="space-y-5">
          <div className="rounded-[18px] border border-black/[.06] bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">把原始材料变成可编辑题库</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  支持粘贴一整段题目说明、编号列表、CSV/TSV，或上传 .xlsx 表格。AI 只负责生成草稿，保存前你可以逐条修改。
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">题库名称</label>
              <input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="可留空由 AI 生成" />
            </div>
            <div>
              <label className="label">题库说明</label>
              <input className="field" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="可选" />
            </div>
          </div>

          <div>
            <label className="label">粘贴题目材料</label>
            <textarea
              className="field min-h-44 resize-y leading-6"
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder={"例如：\n1. Talk about a city you would like to visit.\n2. Technology and daily communication / medium / life, tech"}
            />
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[16px] border border-dashed border-black/15 bg-white p-4 transition hover:border-accent/45 hover:bg-accent/[.025]">
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/[.04] text-muted">
                {file ? <FileSpreadsheet className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{file ? file.name : "上传 Excel、CSV、TSV 或 TXT"}</span>
                <span className="mt-1 block text-xs text-muted">文件最大 2MB，可以和粘贴内容一起解析。</span>
              </span>
            </span>
            <input
              type="file"
              className="hidden"
              accept=".xlsx,.csv,.tsv,.txt"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>

          {preview.error && <InlineMessage>{preview.error.message}</InlineMessage>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>取消</Button>
            <Button disabled={!canPreview} loading={preview.isPending} icon={<Sparkles className="h-4 w-4" />} onClick={() => preview.mutate()}>
              解析为题库
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
            <div>
              <label className="label">题库名称</label>
              <input className="field" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <label className="label">题库说明</label>
              <input className="field" value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setTopics((items) => [...items, emptyTopic])}>
              加一题
            </Button>
          </div>

          {warnings.length ? (
            <div className="rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
              {warnings.join(" ")}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-[16px] border border-black/[.08] bg-white">
            <div className="grid grid-cols-[1fr_116px_100px_132px_42px] gap-2 border-b border-black/[.06] px-3 py-2 text-xs font-medium text-muted max-lg:hidden">
              <span>题目</span>
              <span>分类</span>
              <span>难度</span>
              <span>标签</span>
              <span />
            </div>
            <div className="max-h-[48dvh] divide-y divide-black/[.055] overflow-y-auto">
              {topics.map((topic, index) => (
                <div key={index} className="grid gap-2 p-3 lg:grid-cols-[1fr_116px_100px_132px_42px]">
                  <textarea
                    className="field min-h-20 resize-y text-sm leading-5 lg:min-h-12"
                    value={topic.prompt}
                    onChange={(event) => updateTopic(index, { prompt: event.target.value })}
                  />
                  <input className="field" value={topic.category} onChange={(event) => updateTopic(index, { category: event.target.value })} />
                  <select className="field" value={topic.difficulty} onChange={(event) => updateTopic(index, { difficulty: event.target.value as Difficulty })}>
                    <option value="easy">基础</option>
                    <option value="medium">进阶</option>
                    <option value="hard">挑战</option>
                  </select>
                  <input className="field" value={topic.tags} onChange={(event) => updateTopic(index, { tags: event.target.value })} />
                  <button
                    title="删除"
                    className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-red-50 hover:text-danger"
                    onClick={() => removeTopic(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {commit.error && <InlineMessage>{commit.error.message}</InlineMessage>}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">将创建 {validCount} 道有效题目，保存后仍可继续增删改查。</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStep("source")}>返回修改材料</Button>
              <Button disabled={!canCommit} loading={commit.isPending} onClick={() => commit.mutate()}>
                创建题库
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
