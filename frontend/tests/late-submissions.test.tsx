import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeadlineNotice } from "../src/components/common/DeadlineNotice";
import { TaskDetailPage } from "../src/pages/student/TaskDetailPage";
import { WritingTaskDetailPage } from "../src/pages/student/WritingTaskDetailPage";
import { WritingPage } from "../src/pages/student/WritingPage";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../src/api/client", () => ({ api: mocks.api }));
// Presence and integrity tracking are unrelated to submission availability.
vi.mock("../src/hooks/useWritingPresence", () => ({ useWritingPresence: () => undefined }));
vi.mock("../src/hooks/useAntiCopyPaste", () => ({ useAntiCopyPaste: () => undefined }));

const dueAt = "2026-10-01T12:00:00Z";
let clients: QueryClient[];
let routers: ReturnType<typeof createMemoryRouter>[];
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); clients = []; routers = []; });
afterEach(() => { cleanup(); routers.forEach((r) => r.dispose()); clients.forEach((c) => c.clear()); vi.useRealTimers(); });

function mount(path: string, url: string, element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const router = createMemoryRouter([{ path, element }, { path: "*", element: <p>Training started</p> }], { initialEntries: [url] });
  routers.push(router);
  return render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}

describe("late submission", () => {
  it("shows the overdue reminder as the deadline passes without refreshing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T11:59:59Z"));
    render(<DeadlineNotice dueAt={dueAt} />);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => { vi.advanceTimersByTime(1001); });
    expect(screen.getByRole("status").textContent).toContain("本次作业已逾期");
  });

  it("does not label an on-time submission overdue when viewed later", () => {
    const { rerender } = render(<DeadlineNotice dueAt={dueAt} submittedAt="2026-10-01T11:00:00Z" compact />);
    expect(screen.queryByText("逾期补交")).toBeNull();
    rerender(<DeadlineNotice dueAt={dueAt} submittedAt="2026-10-01T13:00:00Z" compact />);
    expect(screen.getByText("逾期补交")).toBeTruthy();
  });

  it("lets a student start an overdue oral task", async () => {
    mocks.api.mockImplementation(async (_path: string, options?: RequestInit) => options?.method
      ? { id: 8 } : { id: 1, name: "Oral task", due_at: "2020-01-01T00:00:00Z", status: "published", my_phase: null });
    mount("/app/tasks/:taskId", "/app/tasks/1", <TaskDetailPage />);
    const button = await screen.findByRole("button", { name: "开始训练并试音" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("已逾期");
    fireEvent.click(button);
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/tasks/1/sessions", { method: "POST" }));
  });

  it("lets a student start a legacy overdue writing task with late permission false", async () => {
    mocks.api.mockImplementation(async (_path: string, options?: RequestInit) => options?.method
      ? { id: 8 } : { id: 1, title: "Writing task", due_at: "2020-01-01T00:00:00Z", starts_at: "2019-01-01T00:00:00Z", status: "published", allow_late_submission: false });
    mount("/app/writing/:assignmentId", "/app/writing/1", <WritingTaskDetailPage />);
    const button = await screen.findByRole("button", { name: "开始写作" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("已逾期");
    fireEvent.click(button);
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/writing/assignments/1/submissions", { method: "POST" }));
  });

  it("keeps a late writing draft editable and allows submitting it", async () => {
    const submission = { id: 8, assignment_id: 1, status: "drafting", draft_content: "My late essay.", revisions: [], remaining_revisions: 0 };
    mocks.api.mockImplementation(async (path: string) => path === "/writing/assignments/1"
      ? { id: 1, title: "Writing task", due_at: "2020-01-01T00:00:00Z", status: "published", min_words: 1, allow_late_submission: false }
      : path.endsWith("/submit") ? { ...submission, status: "finalized", final_submitted_at: new Date().toISOString() } : submission);
    mount("/app/writing/session/:submissionId", "/app/writing/session/8", <WritingPage />);
    const textbox = await screen.findByRole("textbox");
    expect((textbox as HTMLTextAreaElement).readOnly).toBe(false);
    const button = await screen.findByRole("button", { name: "提交初稿" });
    fireEvent.click(button);
    await waitFor(() => expect(mocks.api.mock.calls.some(([path, options]) => path === "/writing/submissions/8/submit" && options?.method === "POST")).toBe(true));
  });

  it("keeps a manually closed task unavailable and does not offer late submission", async () => {
    mocks.api.mockResolvedValue({ id: 1, name: "Closed task", due_at: "2020-01-01T00:00:00Z", status: "closed", my_phase: null });
    mount("/app/tasks/:taskId", "/app/tasks/1", <TaskDetailPage />);
    expect((await screen.findByRole("button", { name: "任务已关闭" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
