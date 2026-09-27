import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainingPage } from "../src/pages/student/TrainingPage";
import type { TrainingSession } from "../src/types";

const mocks = vi.hoisted(() => ({
  api: vi.fn(), prepare: vi.fn(), start: vi.fn(), stop: vi.fn(), cache: vi.fn(),
}));
vi.mock("../src/api/client", () => ({ api: mocks.api }));
vi.mock("../src/utils/recordingCache", () => ({ recordingCache: mocks.cache }));
vi.mock("../src/components/common/AudioPlayer", () => ({ AudioPlayer: () => null, AudioDownloadButton: () => null }));
vi.mock("../src/hooks/useRecorder", async () => {
  const { useState } = await import("react");
  return { useRecorder: () => {
    const [recording, setRecording] = useState(false);
    return {
      permission: "granted", recording, volume: 0, selectedDeviceId: "test-mic",
      prepare: mocks.prepare,
      start: async () => {
        await mocks.start();
        setRecording(true);
        // Give React time to render while the start promise is unresolved. This
        // exposes the old review + recording=true race reliably on every device.
        await new Promise((resolve) => setTimeout(resolve, 80));
      },
      stop: async () => { mocks.stop(); setRecording(false); return { blob: new Blob(["recorded-audio"], { type: "audio/mp4" }), duration: 5 }; },
    };
  }, isVirtualAudioDevice: () => false };
});

function fixture(phase: TrainingSession["phase"] = "review"): TrainingSession {
  const now = Date.now();
  return {
    id: 3, task_id: 2, student_id: 7, student_name: "Test", student_no: "test",
    phase, recording_attempts_started: 1, rerecords_remaining: 3,
    speaking_started_at: new Date(now - 120_000).toISOString(),
    speaking_ends_at: new Date(now - 60_000).toISOString(),
    speaking_finished_at: new Date(now - 60_000).toISOString(),
    preparation_ends_at: new Date(now - 1_000).toISOString(),
    server_time: new Date(now).toISOString(), note: "Keep my notes", return_history: [],
    task: { id: 2, name: "Test oral task", status: "published", due_at: new Date(now + 86400_000).toISOString(), speaking_seconds: 60, preparation_seconds: 60, allow_early_finish: true },
    final_topic: { prompt: "Topic" },
    recordings: [{ id: 2, attempt_number: 1, is_selected: true, stream_url: "/old-recording", duration_seconds: 54 }],
  } as TrainingSession;
}

let server: TrainingSession;
let client: QueryClient;
let routers: ReturnType<typeof createMemoryRouter>[];
const mutations = (name: string) => mocks.api.mock.calls.filter(([path]) => path.endsWith(`/${name}`));
const pause = (ms = 140) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

function mount() {
  const router = createMemoryRouter([{ path: "/app/training/:sessionId", element: <TrainingPage /> }], { initialEntries: ["/app/training/3"] });
  routers.push(router);
  return render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("speaking-lab-user", JSON.stringify({ id: 7 }));
  routers = [];
  server = fixture();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 }, mutations: { retry: false } } });
  mocks.prepare.mockResolvedValue(undefined);
  mocks.start.mockResolvedValue(undefined);
  mocks.cache.mockResolvedValue(undefined);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:recording"), revokeObjectURL: vi.fn() }));
  mocks.api.mockImplementation(async (path: string, options?: RequestInit) => {
    if (!options?.method) return structuredClone(server);
    if (path.endsWith("/retry-speaking") || path.endsWith("/start-speaking")) {
      const resume = server.phase === "speaking";
      server = { ...server, phase: "speaking", recording_attempts_started: server.recording_attempts_started + (resume ? 0 : 1),
        speaking_started_at: resume ? server.speaking_started_at : new Date().toISOString(),
        speaking_ends_at: new Date(Date.now() + 60_000).toISOString(), speaking_finished_at: null, server_time: new Date().toISOString() };
    }
    if (path.endsWith("/finish-speaking")) server = { ...server, phase: "review", speaking_finished_at: new Date().toISOString() };
    return structuredClone(server);
  });
});

afterEach(() => { cleanup(); routers.forEach((r) => r.dispose()); client.clear(); vi.unstubAllGlobals(); });

describe("oral re-recording lifecycle", () => {
  it("starts a new take without automatically stopping/uploading, then allows a manual finish", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /重新录制/ }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    await pause();
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(mutations("finish-speaking")).toHaveLength(0);
    expect(mutations("recordings")).toHaveLength(0);
    expect(client.getQueryData<TrainingSession>(["session", 3])?.phase).toBe("speaking");
    fireEvent.click(await screen.findByRole("button", { name: "结束演讲" }));
    await waitFor(() => expect(mutations("recordings")).toHaveLength(1));
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    expect(mutations("finish-speaking")).toHaveLength(1);
  });

  it("cancels an in-flight poll from the previous review so it cannot overwrite the new take", async () => {
    mount();
    await screen.findByRole("button", { name: /重新录制/ });
    const old = structuredClone(server);
    let release!: (value: TrainingSession) => void;
    let pollSignal: AbortSignal | undefined;
    const normalApi = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation((path, options) => {
      if (!options?.method) {
        pollSignal = options?.signal;
        return new Promise((resolve) => { release = resolve; });
      }
      return normalApi(path, options);
    });
    let poll!: Promise<void>;
    await act(async () => { poll = client.refetchQueries({ queryKey: ["session", 3] }); });
    fireEvent.click(screen.getByRole("button", { name: /重新录制/ }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    await act(async () => { release(old); await poll; });
    await pause();
    expect(pollSignal?.aborted).toBe(true);
    expect(client.getQueryData<TrainingSession>(["session", 3])?.recording_attempts_started).toBe(2);
    expect(mocks.stop).not.toHaveBeenCalled();
  });

  it("ignores review status for an older take but stops once for completion of the active take", async () => {
    mount();
    const old = structuredClone(server);
    fireEvent.click(await screen.findByRole("button", { name: /重新录制/ }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    await pause();
    await act(async () => { client.setQueryData(["session", 3], old); });
    await pause();
    expect(mocks.stop).not.toHaveBeenCalled();
    server = { ...server, phase: "review" };
    await act(async () => { client.setQueryData(["session", 3], { ...server }); });
    await waitFor(() => expect(mutations("recordings")).toHaveLength(1));
    expect(mocks.stop).toHaveBeenCalledTimes(1);
  });

  it("still stops and uploads when the active countdown expires", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /重新录制/ }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    await pause();
    server = { ...server, speaking_ends_at: new Date(Date.now() - 1000).toISOString(), server_time: new Date().toISOString() };
    await act(async () => { client.setQueryData(["session", 3], { ...server }); });
    await waitFor(() => expect(mutations("recordings")).toHaveLength(1));
    expect(mocks.stop).toHaveBeenCalledTimes(1);
  });

  it("does not consume an attempt when microphone permission fails", async () => {
    mocks.prepare.mockRejectedValueOnce(new Error("Microphone denied"));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /重新录制/ }));
    await waitFor(() => expect(screen.getAllByText("Microphone denied").length).toBeGreaterThan(0));
    expect(mutations("retry-speaking")).toHaveLength(0);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("can resume the same take after the recorder fails to start without consuming another attempt", async () => {
    mocks.start.mockRejectedValueOnce(new Error("Recorder unavailable"));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /重新录制/ }));
    const resume = await screen.findByRole("button", { name: "恢复录音" });
    await waitFor(() => expect((resume as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByText("Recorder unavailable")).toBeTruthy();
    fireEvent.click(resume);
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
    await pause();
    expect(mutations("retry-speaking")).toHaveLength(1);
    expect(mutations("start-speaking")).toHaveLength(1);
    expect(server.recording_attempts_started).toBe(2);
    expect(mocks.stop).not.toHaveBeenCalled();
  });

  it("starts the first take after preparation without immediately finishing", async () => {
    server = fixture("preparing");
    server.recording_attempts_started = 0;
    server.recordings = [];
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "开始演讲并录音" }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    await pause();
    expect(server.recording_attempts_started).toBe(1);
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "结束演讲" })).toBeTruthy();
  });
});
