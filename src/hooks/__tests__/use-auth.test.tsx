import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";

const pushMock = vi.fn();
const signInActionMock = vi.fn();
const signUpActionMock = vi.fn();
const getAnonWorkDataMock = vi.fn();
const clearAnonWorkMock = vi.fn();
const getProjectsMock = vi.fn();
const createProjectMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/actions", () => ({
  signIn: (...args: unknown[]) => signInActionMock(...args),
  signUp: (...args: unknown[]) => signUpActionMock(...args),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: (...args: unknown[]) => getAnonWorkDataMock(...args),
  clearAnonWork: (...args: unknown[]) => clearAnonWorkMock(...args),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: (...args: unknown[]) => getProjectsMock(...args),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: (...args: unknown[]) => createProjectMock(...args),
}));

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test("returns signIn, signUp, and an initial isLoading=false", () => {
    const { result } = renderHook(() => useAuth());

    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
    expect(result.current.isLoading).toBe(false);
  });

  describe("signIn", () => {
    test("returns the action result on successful sign-in", async () => {
      signInActionMock.mockResolvedValue({ success: true });
      getAnonWorkDataMock.mockReturnValue(null);
      getProjectsMock.mockResolvedValue([{ id: "proj-1" }]);

      const { result } = renderHook(() => useAuth());

      let returned: unknown;
      await act(async () => {
        returned = await result.current.signIn("a@b.com", "secretpass");
      });

      expect(signInActionMock).toHaveBeenCalledWith("a@b.com", "secretpass");
      expect(returned).toEqual({ success: true });
    });

    test("returns the action result on failed sign-in without running post-sign-in flow", async () => {
      signInActionMock.mockResolvedValue({
        success: false,
        error: "Invalid credentials",
      });

      const { result } = renderHook(() => useAuth());

      let returned: unknown;
      await act(async () => {
        returned = await result.current.signIn("a@b.com", "wrong");
      });

      expect(returned).toEqual({ success: false, error: "Invalid credentials" });
      expect(getAnonWorkDataMock).not.toHaveBeenCalled();
      expect(getProjectsMock).not.toHaveBeenCalled();
      expect(createProjectMock).not.toHaveBeenCalled();
      expect(pushMock).not.toHaveBeenCalled();
    });

    test("toggles isLoading while the action is pending and resets to false when done", async () => {
      let resolveAction: (value: { success: boolean }) => void = () => {};
      signInActionMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveAction = resolve;
          })
      );
      getAnonWorkDataMock.mockReturnValue(null);
      getProjectsMock.mockResolvedValue([{ id: "proj-1" }]);

      const { result } = renderHook(() => useAuth());

      let signInPromise: Promise<unknown>;
      act(() => {
        signInPromise = result.current.signIn("a@b.com", "password1");
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      await act(async () => {
        resolveAction({ success: true });
        await signInPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("resets isLoading to false when the action rejects, and re-throws", async () => {
      signInActionMock.mockRejectedValue(new Error("boom"));

      const { result } = renderHook(() => useAuth());

      await expect(
        act(async () => {
          await result.current.signIn("a@b.com", "password1");
        })
      ).rejects.toThrow("boom");

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("signUp", () => {
    test("returns the action result on successful sign-up", async () => {
      signUpActionMock.mockResolvedValue({ success: true });
      getAnonWorkDataMock.mockReturnValue(null);
      getProjectsMock.mockResolvedValue([{ id: "new-proj" }]);

      const { result } = renderHook(() => useAuth());

      let returned: unknown;
      await act(async () => {
        returned = await result.current.signUp("new@b.com", "password1");
      });

      expect(signUpActionMock).toHaveBeenCalledWith("new@b.com", "password1");
      expect(returned).toEqual({ success: true });
    });

    test("returns the action result on failed sign-up without running post-sign-in flow", async () => {
      signUpActionMock.mockResolvedValue({
        success: false,
        error: "Email already registered",
      });

      const { result } = renderHook(() => useAuth());

      let returned: unknown;
      await act(async () => {
        returned = await result.current.signUp("taken@b.com", "password1");
      });

      expect(returned).toEqual({
        success: false,
        error: "Email already registered",
      });
      expect(getAnonWorkDataMock).not.toHaveBeenCalled();
      expect(createProjectMock).not.toHaveBeenCalled();
      expect(pushMock).not.toHaveBeenCalled();
    });

    test("resets isLoading to false when the action rejects, and re-throws", async () => {
      signUpActionMock.mockRejectedValue(new Error("network down"));

      const { result } = renderHook(() => useAuth());

      await expect(
        act(async () => {
          await result.current.signUp("a@b.com", "password1");
        })
      ).rejects.toThrow("network down");

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("post-sign-in routing", () => {
    test("creates a project from anonymous work, clears it, and navigates to the new project", async () => {
      const anonMessages = [{ role: "user", content: "hello" }];
      const anonData = { "/": { type: "directory" } };
      signInActionMock.mockResolvedValue({ success: true });
      getAnonWorkDataMock.mockReturnValue({
        messages: anonMessages,
        fileSystemData: anonData,
      });
      createProjectMock.mockResolvedValue({ id: "from-anon" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "password1");
      });

      expect(createProjectMock).toHaveBeenCalledTimes(1);
      const createArgs = createProjectMock.mock.calls[0][0];
      expect(createArgs.messages).toBe(anonMessages);
      expect(createArgs.data).toBe(anonData);
      expect(typeof createArgs.name).toBe("string");
      expect(createArgs.name).toMatch(/^Design from /);

      expect(clearAnonWorkMock).toHaveBeenCalledTimes(1);
      expect(getProjectsMock).not.toHaveBeenCalled();
      expect(pushMock).toHaveBeenCalledWith("/from-anon");
    });

    test("ignores anonymous work with an empty messages array and uses the most recent project instead", async () => {
      signInActionMock.mockResolvedValue({ success: true });
      getAnonWorkDataMock.mockReturnValue({
        messages: [],
        fileSystemData: { "/": { type: "directory" } },
      });
      getProjectsMock.mockResolvedValue([
        { id: "recent" },
        { id: "older" },
      ]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "password1");
      });

      expect(createProjectMock).not.toHaveBeenCalled();
      expect(clearAnonWorkMock).not.toHaveBeenCalled();
      expect(pushMock).toHaveBeenCalledWith("/recent");
    });

    test("navigates to the first (most recent) project when no anonymous work exists", async () => {
      signInActionMock.mockResolvedValue({ success: true });
      getAnonWorkDataMock.mockReturnValue(null);
      getProjectsMock.mockResolvedValue([
        { id: "newest" },
        { id: "middle" },
        { id: "oldest" },
      ]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "password1");
      });

      expect(pushMock).toHaveBeenCalledWith("/newest");
      expect(createProjectMock).not.toHaveBeenCalled();
    });

    test("creates a fresh project when there is no anon work and no existing projects", async () => {
      signInActionMock.mockResolvedValue({ success: true });
      getAnonWorkDataMock.mockReturnValue(null);
      getProjectsMock.mockResolvedValue([]);
      createProjectMock.mockResolvedValue({ id: "brand-new" });

      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.12345);
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "password1");
      });

      expect(createProjectMock).toHaveBeenCalledTimes(1);
      const createArgs = createProjectMock.mock.calls[0][0];
      expect(createArgs.messages).toEqual([]);
      expect(createArgs.data).toEqual({});
      expect(createArgs.name).toMatch(/^New Design #\d+$/);

      expect(pushMock).toHaveBeenCalledWith("/brand-new");

      randomSpy.mockRestore();
    });

    test("runs the same post-sign-in flow after a successful signUp", async () => {
      signUpActionMock.mockResolvedValue({ success: true });
      getAnonWorkDataMock.mockReturnValue(null);
      getProjectsMock.mockResolvedValue([{ id: "after-signup" }]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@b.com", "password1");
      });

      expect(pushMock).toHaveBeenCalledWith("/after-signup");
    });
  });
});
