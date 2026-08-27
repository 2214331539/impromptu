import { useMutation } from "@tanstack/react-query";
import { FileSpreadsheet, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../api/client";
import { Button } from "../../components/common/Button";
import { Modal } from "../../components/common/Modal";
import { InlineMessage } from "../../components/common/States";
import type { TopicBank, TopicImportCommit, TopicImportItem, TopicImportPreview } from "../../types";

const emptyTopic: TopicImportItem = {
  prompt: "",
  category: "Topic",
  difficulty: "medium",
  tags: "",
};

function normalizeTopic(value: string): TopicImportItem {
  return {
    prompt: value,
    category: "Topic",
    difficulty: "medium",
    tags: "",
  };
}

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

  const canPreview = rawText.trim().length >= 2 || !!file;
  const validCount = useMemo(
    () => topics.filter((topic) => topic.prompt.trim().length >= 2).length,
    [topics],
  );
  const canCommit = name.trim().length >= 2 && validCount > 0;

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
      setTopics(result.topics.length ? result.topics.map((topic) => normalizeTopic(topic.prompt)) : [emptyTopic]);
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
            .filter((topic) => topic.prompt.trim().length >= 2)
            .map((topic) => normalizeTopic(topic.prompt.trim())),
        }),
      }),
    onSuccess: (result) => {
      onImported(result.bank);
      close();
    },
  });

  const updateTopic = (index: number, value: string) => {
    setTopics((items) => items.map((item, current) => (current === index ? normalizeTopic(value) : item)));
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
                <p className="text-sm font-semibold text-ink">从材料中提取主题</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  可以粘贴自然语言、编号列表，或上传 Excel 表格。AI 只提取主题词，不生成标签、分类或扩展题目。
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">题库名称</label>
              <input
                className="field"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：心理学主题"
              />
            </div>
            <div>
              <label className="label">题库说明</label>
              <input
                className="field"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="可选"
              />
            </div>
          </div>

          <div>
            <label className="label">粘贴主题材料</label>
            <textarea
              className="field min-h-44 resize-y leading-6"
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder={"例如：\nGrowth Mindset\nCognitive Dissonance\nMaslow's Hierarchy of Needs\nDelayed Gratifcation"}
            />
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[16px] border border-dashed border-black/15 bg-white p-4 transition hover:border-accent/45 hover:bg-accent/[.025]">
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/[.04] text-muted">
                {file ? <FileSpreadsheet className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">
                  {file ? file.name : "上传 Excel、CSV、TSV 或 TXT"}
                </span>
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
            <Button variant="ghost" onClick={close}>
              取消
            </Button>
            <Button
              disabled={!canPreview}
              loading={preview.isPending}
              icon={<Sparkles className="h-4 w-4" />}
              onClick={() => preview.mutate()}
            >
              提取主题
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
              加主题
            </Button>
          </div>

          {warnings.length ? (
            <div className="rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
              {warnings.join(" ")}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-[16px] border border-black/[.08] bg-white">
            <div className="grid grid-cols-[48px_1fr_42px] gap-2 border-b border-black/[.06] px-3 py-2 text-xs font-medium text-muted">
              <span>序号</span>
              <span>主题</span>
              <span />
            </div>
            <div className="max-h-[48dvh] divide-y divide-black/[.055] overflow-y-auto">
              {topics.map((topic, index) => (
                <div key={index} className="grid grid-cols-[48px_1fr_42px] items-start gap-2 p-3">
                  <span className="pt-2 text-xs text-muted">{index + 1}</span>
                  <input
                    className="field"
                    value={topic.prompt}
                    onChange={(event) => updateTopic(index, event.target.value)}
                    placeholder="输入主题"
                  />
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
            <p className="text-xs text-muted">将创建 {validCount} 个主题，保存后仍可在题库中继续编辑。</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStep("source")}>
                返回修改材料
              </Button>
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
