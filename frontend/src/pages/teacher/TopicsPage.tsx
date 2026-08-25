import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, Layers3, Plus, Power, Search, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../api/client";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Modal } from "../../components/common/Modal";
import { EmptyState, ErrorState, InlineMessage, LoadingState } from "../../components/common/States";
import { AiTopicImportModal } from "../../features/topics/AiTopicImportModal";
import type { Difficulty, Topic, TopicBank } from "../../types";
import { difficultyLabel } from "../../utils/format";

type TopicDraft = Pick<Topic, "prompt" | "category" | "difficulty" | "tags">;

const blankTopic: TopicDraft = {
  prompt: "",
  category: "Daily life",
  difficulty: "medium",
  tags: "",
};

export function TopicsPage() {
  const client = useQueryClient();
  const [selectedBank, setSelectedBank] = useState<number | null>(null);
  const [bankModal, setBankModal] = useState(false);
  const [topicModal, setTopicModal] = useState(false);
  const [aiImportModal, setAiImportModal] = useState(false);
  const [bankName, setBankName] = useState("");
  const [bankDescription, setBankDescription] = useState("");
  const [draft, setDraft] = useState<TopicDraft>(blankTopic);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [deleteBankId, setDeleteBankId] = useState<number | null>(null);

  const banks = useQuery({
    queryKey: ["topic-banks"],
    queryFn: () => api<TopicBank[]>("/topic-banks"),
  });
  const activeBankId = selectedBank ?? banks.data?.[0]?.id ?? null;
  const topics = useQuery({
    queryKey: ["topics", activeBankId],
    queryFn: () => api<Topic[]>(`/topic-banks/${activeBankId}/topics`),
    enabled: !!activeBankId,
  });

  const visible = useMemo(
    () =>
      (topics.data || []).filter(
        (topic) =>
          (difficulty === "all" || topic.difficulty === difficulty) &&
          (!search ||
            `${topic.prompt} ${topic.category} ${topic.tags}`
              .toLowerCase()
              .includes(search.toLowerCase())),
      ),
    [topics.data, difficulty, search],
  );

  const createBank = useMutation({
    mutationFn: () =>
      api<TopicBank>("/topic-banks", {
        method: "POST",
        body: JSON.stringify({ name: bankName, description: bankDescription }),
      }),
    onSuccess: async (item) => {
      setBankModal(false);
      setBankName("");
      setBankDescription("");
      setSelectedBank(item.id);
      await client.invalidateQueries({ queryKey: ["topic-banks"] });
    },
  });

  const saveTopic = useMutation({
    mutationFn: () =>
      editingId
        ? api<Topic>(`/topics/${editingId}`, { method: "PATCH", body: JSON.stringify(draft) })
        : api<Topic>(`/topic-banks/${activeBankId}/topics`, {
            method: "POST",
            body: JSON.stringify(draft),
          }),
    onSuccess: async () => {
      setTopicModal(false);
      setDraft(blankTopic);
      setEditingId(null);
      await client.invalidateQueries({ queryKey: ["topics", activeBankId] });
      await client.invalidateQueries({ queryKey: ["topic-banks"] });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Topic> }) =>
      api<Topic>(`/topics/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["topics", activeBankId] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/topics/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["topics", activeBankId] });
      await client.invalidateQueries({ queryKey: ["topic-banks"] });
    },
  });

  const removeBank = useMutation({
    mutationFn: (id: number) => api<void>(`/topic-banks/${id}`, { method: "DELETE" }),
    onSuccess: async (_data, id) => {
      setDeleteBankId(null);
      if (activeBankId === id) setSelectedBank(null);
      await client.invalidateQueries({ queryKey: ["topic-banks"] });
      await client.invalidateQueries({ queryKey: ["topics", id] });
    },
  });

  if (banks.isLoading) return <LoadingState />;
  if (banks.isError) return <ErrorState message={banks.error.message} retry={() => banks.refetch()} />;

  const bank = banks.data?.find((item) => item.id === activeBankId);
  const deleteBankTarget = banks.data?.find((item) => item.id === deleteBankId) ?? null;
  const openEdit = (topic: Topic) => {
    setEditingId(topic.id);
    setDraft({
      prompt: topic.prompt,
      category: topic.category,
      difficulty: topic.difficulty,
      tags: topic.tags,
    });
    setTopicModal(true);
  };

  return (
    <div className="page-enter">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">题库管理</h1>
          <p className="mt-2 text-sm text-muted">维护用于随机抽取的口语题目。</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button
            variant="secondary"
            icon={<Sparkles className="h-4 w-4" />}
            onClick={() => setAiImportModal(true)}
          >
            AI 导入题库
          </Button>
          <Button
            variant="secondary"
            icon={<Layers3 className="h-4 w-4" />}
            onClick={() => setBankModal(true)}
          >
            新建题库
          </Button>
          <Button
            icon={<Plus className="h-4 w-4" />}
            disabled={!activeBankId}
            onClick={() => {
              setEditingId(null);
              setDraft(blankTopic);
              setTopicModal(true);
            }}
          >
            新增题目
          </Button>
        </div>
      </header>

      {!banks.data?.length ? (
        <EmptyState
          title="还没有题库"
          description="先创建题库，再添加用于训练的题目。"
          action={<Button onClick={() => setBankModal(true)}>创建题库</Button>}
        />
      ) : (
        <>
          <div className="scrollbar-none mb-5 flex snap-x gap-2 overflow-x-auto pb-2">
            {banks.data.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedBank(item.id)}
                className={`shrink-0 snap-start rounded-[11px] border px-4 py-2.5 text-left ${
                  activeBankId === item.id
                    ? "border-ink bg-ink text-white"
                    : "border-black/[.08] bg-white text-ink"
                }`}
              >
                <p className="text-sm font-medium">{item.name}</p>
              </button>
            ))}
          </div>

          <section className="surface overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-black/[.06] p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-lg font-semibold">{bank?.name}</h2>
                  <button
                    title="删除题库"
                    className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-red-50 hover:text-danger"
                    onClick={() => bank && setDeleteBankId(bank.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted">{bank?.description || "暂无题库说明"}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    className="field h-9 w-full pl-9 sm:w-56"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索题目或标签"
                  />
                </label>
                <select
                  className="field h-9 px-3 py-0 sm:w-32"
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value as Difficulty | "all")}
                >
                  <option value="all">全部难度</option>
                  <option value="easy">基础</option>
                  <option value="medium">进阶</option>
                  <option value="hard">挑战</option>
                </select>
              </div>
            </div>

            {topics.isLoading ? (
              <LoadingState />
            ) : topics.isError ? (
              <ErrorState message={topics.error.message} retry={() => topics.refetch()} />
            ) : visible.length ? (
              <div className="divide-y divide-black/[.055]">
                {visible.map((topic) => (
                  <div
                    key={topic.id}
                    className={`flex flex-col gap-4 p-5 sm:flex-row sm:items-center ${
                      !topic.is_active ? "opacity-55" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <Badge tone="blue">{topic.category}</Badge>
                        <Badge>{difficultyLabel[topic.difficulty]}</Badge>
                        {topic.tags
                          .split(",")
                          .filter(Boolean)
                          .slice(0, 3)
                          .map((tag) => (
                            <Badge key={tag}>{tag}</Badge>
                          ))}
                      </div>
                      <p className="text-sm font-medium leading-6">{topic.prompt}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        title={topic.is_active ? "停用" : "启用"}
                        className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-black/5"
                        onClick={() => update.mutate({ id: topic.id, data: { is_active: !topic.is_active } })}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                      <button
                        title="编辑"
                        className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-black/5"
                        onClick={() => openEdit(topic)}
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        title="删除"
                        className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-red-50 hover:text-danger"
                        onClick={() =>
                          confirm("确定删除这道题目？已有训练引用时将改为停用。") && remove.mutate(topic.id)
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="没有匹配的题目" description="调整筛选条件，或添加一道新题目。" />
            )}
          </section>
        </>
      )}

      <Modal open={bankModal} onClose={() => setBankModal(false)} title="新建题库">
        <div className="space-y-4">
          <div>
            <label className="label">题库名称</label>
            <input className="field" value={bankName} onChange={(event) => setBankName(event.target.value)} />
          </div>
          <div>
            <label className="label">说明</label>
            <textarea
              className="field min-h-24 resize-none"
              value={bankDescription}
              onChange={(event) => setBankDescription(event.target.value)}
            />
          </div>
          {createBank.error && <InlineMessage>{createBank.error.message}</InlineMessage>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBankModal(false)}>
              取消
            </Button>
            <Button disabled={bankName.trim().length < 2} loading={createBank.isPending} onClick={() => createBank.mutate()}>
              创建
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={topicModal} onClose={() => setTopicModal(false)} title={editingId ? "编辑题目" : "新增题目"}>
        <div className="space-y-4">
          <div>
            <label className="label">英文题目</label>
            <textarea
              className="field min-h-28 resize-none leading-6"
              value={draft.prompt}
              onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">分类</label>
              <input
                className="field"
                value={draft.category}
                onChange={(event) => setDraft({ ...draft, category: event.target.value })}
              />
            </div>
            <div>
              <label className="label">难度</label>
              <select
                className="field"
                value={draft.difficulty}
                onChange={(event) => setDraft({ ...draft, difficulty: event.target.value as Difficulty })}
              >
                <option value="easy">基础</option>
                <option value="medium">进阶</option>
                <option value="hard">挑战</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">标签（英文逗号分隔）</label>
            <input
              className="field"
              value={draft.tags}
              onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
            />
          </div>
          {saveTopic.error && <InlineMessage>{saveTopic.error.message}</InlineMessage>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTopicModal(false)}>
              取消
            </Button>
            <Button
              disabled={draft.prompt.trim().length < 5 || !draft.category.trim()}
              loading={saveTopic.isPending}
              onClick={() => saveTopic.mutate()}
            >
              保存
            </Button>
          </div>
        </div>
      </Modal>

      <AiTopicImportModal
        open={aiImportModal}
        onClose={() => setAiImportModal(false)}
        onImported={async (item) => {
          setSelectedBank(item.id);
          await client.invalidateQueries({ queryKey: ["topic-banks"] });
          await client.invalidateQueries({ queryKey: ["topics", item.id] });
        }}
      />

      <Modal open={deleteBankId !== null} onClose={() => setDeleteBankId(null)} title="删除题库">
        <div className="space-y-4">
          <p className="text-sm leading-6 text-muted">
            确定删除题库「{deleteBankTarget?.name}」吗？题库中的题目将一并删除，此操作无法撤销。
          </p>
          {removeBank.error && <InlineMessage>{removeBank.error.message}</InlineMessage>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteBankId(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              loading={removeBank.isPending}
              onClick={() => deleteBankId !== null && removeBank.mutate(deleteBankId)}
            >
              删除
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
