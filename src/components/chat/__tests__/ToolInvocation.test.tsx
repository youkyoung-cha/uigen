import { test, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ToolInvocation, getFriendlyToolLabel } from "../ToolInvocation";

afterEach(() => {
  cleanup();
});

test("getFriendlyToolLabel maps str_replace_editor create to Creating/Created", () => {
  const label = getFriendlyToolLabel("str_replace_editor", {
    command: "create",
    path: "/App.jsx",
  });
  expect(label.verb).toBe("Creating");
  expect(label.pastVerb).toBe("Created");
  expect(label.path).toBe("/App.jsx");
});

test("getFriendlyToolLabel maps str_replace to Editing", () => {
  const label = getFriendlyToolLabel("str_replace_editor", {
    command: "str_replace",
    path: "/components/Card.jsx",
  });
  expect(label.verb).toBe("Editing");
  expect(label.pastVerb).toBe("Edited");
});

test("getFriendlyToolLabel maps insert to Editing", () => {
  const label = getFriendlyToolLabel("str_replace_editor", {
    command: "insert",
    path: "/App.jsx",
  });
  expect(label.verb).toBe("Editing");
});

test("getFriendlyToolLabel maps view to Viewing", () => {
  const label = getFriendlyToolLabel("str_replace_editor", {
    command: "view",
    path: "/App.jsx",
  });
  expect(label.verb).toBe("Viewing");
  expect(label.pastVerb).toBe("Viewed");
});

test("getFriendlyToolLabel maps undo_edit to Reverting", () => {
  const label = getFriendlyToolLabel("str_replace_editor", {
    command: "undo_edit",
    path: "/App.jsx",
  });
  expect(label.verb).toBe("Reverting");
});

test("getFriendlyToolLabel maps file_manager rename with new_path", () => {
  const label = getFriendlyToolLabel("file_manager", {
    command: "rename",
    path: "/old.jsx",
    new_path: "/new.jsx",
  });
  expect(label.verb).toBe("Renaming");
  expect(label.pastVerb).toBe("Renamed");
  expect(label.path).toBe("/old.jsx");
  expect(label.extra).toBe("/new.jsx");
});

test("getFriendlyToolLabel maps file_manager delete", () => {
  const label = getFriendlyToolLabel("file_manager", {
    command: "delete",
    path: "/App.jsx",
  });
  expect(label.verb).toBe("Deleting");
  expect(label.pastVerb).toBe("Deleted");
});

test("getFriendlyToolLabel falls back for unknown tool", () => {
  const label = getFriendlyToolLabel("mystery_tool", { command: "foo" });
  expect(label.verb).toBe("Running");
  expect(label.pastVerb).toBe("Ran");
  expect(label.extra).toBe("mystery_tool");
});

test("getFriendlyToolLabel handles missing args", () => {
  const label = getFriendlyToolLabel("str_replace_editor", undefined);
  expect(label.verb).toBe("Running");
});

test("ToolInvocation renders present-tense verb while pending", () => {
  render(
    <ToolInvocation
      toolName="str_replace_editor"
      args={{ command: "create", path: "/App.jsx" }}
      state="call"
    />
  );

  const pill = screen.getByTestId("tool-invocation");
  expect(pill.getAttribute("data-state")).toBe("pending");
  expect(screen.getByText("Creating")).toBeDefined();
  expect(screen.getByText("/App.jsx")).toBeDefined();
});

test("ToolInvocation renders past-tense verb when done", () => {
  render(
    <ToolInvocation
      toolName="str_replace_editor"
      args={{ command: "create", path: "/App.jsx" }}
      state="result"
    />
  );

  const pill = screen.getByTestId("tool-invocation");
  expect(pill.getAttribute("data-state")).toBe("done");
  expect(screen.getByText("Created")).toBeDefined();
  expect(screen.getByText("/App.jsx")).toBeDefined();
});

test("ToolInvocation renders rename with arrow between paths", () => {
  render(
    <ToolInvocation
      toolName="file_manager"
      args={{ command: "rename", path: "/a.jsx", new_path: "/b.jsx" }}
      state="result"
    />
  );

  expect(screen.getByText("Renamed")).toBeDefined();
  expect(screen.getByText("/a.jsx")).toBeDefined();
  expect(screen.getByText("→")).toBeDefined();
  expect(screen.getByText("/b.jsx")).toBeDefined();
});

test("ToolInvocation does not render raw tool name for known tools", () => {
  render(
    <ToolInvocation
      toolName="str_replace_editor"
      args={{ command: "create", path: "/App.jsx" }}
      state="result"
    />
  );

  expect(screen.queryByText("str_replace_editor")).toBeNull();
});

test("ToolInvocation renders fallback tool name for unknown tool", () => {
  render(
    <ToolInvocation
      toolName="mystery_tool"
      args={{ command: "foo" }}
      state="call"
    />
  );

  expect(screen.getByText("Running")).toBeDefined();
  expect(screen.getByText("mystery_tool")).toBeDefined();
});
