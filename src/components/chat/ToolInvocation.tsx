"use client";

import { Loader2 } from "lucide-react";

interface ToolInvocationProps {
  toolName: string;
  args?: Record<string, any>;
  state: "partial-call" | "call" | "result" | string;
}

interface FriendlyLabel {
  verb: string;
  pastVerb: string;
  path?: string;
  extra?: string;
}

export function getFriendlyToolLabel(
  toolName: string,
  args?: Record<string, any>
): FriendlyLabel {
  const command: string | undefined = args?.command;
  const path: string | undefined = args?.path;
  const newPath: string | undefined = args?.new_path;

  if (toolName === "str_replace_editor") {
    switch (command) {
      case "create":
        return { verb: "Creating", pastVerb: "Created", path };
      case "str_replace":
      case "insert":
        return { verb: "Editing", pastVerb: "Edited", path };
      case "view":
        return { verb: "Viewing", pastVerb: "Viewed", path };
      case "undo_edit":
        return { verb: "Reverting", pastVerb: "Reverted", path };
    }
  }

  if (toolName === "file_manager") {
    switch (command) {
      case "rename":
        return {
          verb: "Renaming",
          pastVerb: "Renamed",
          path,
          extra: newPath,
        };
      case "delete":
        return { verb: "Deleting", pastVerb: "Deleted", path };
    }
  }

  return { verb: "Running", pastVerb: "Ran", extra: toolName };
}

export function ToolInvocation({ toolName, args, state }: ToolInvocationProps) {
  const label = getFriendlyToolLabel(toolName, args);
  const isDone = state === "result";
  const verb = isDone ? label.pastVerb : label.verb;

  return (
    <div
      className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-neutral-50 rounded-lg text-xs border border-neutral-200"
      data-testid="tool-invocation"
      data-state={isDone ? "done" : "pending"}
    >
      {isDone ? (
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
      ) : (
        <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
      )}
      <span className="text-neutral-700">{verb}</span>
      {label.path && (
        <span className="font-mono text-neutral-900">{label.path}</span>
      )}
      {label.extra && toolName === "file_manager" && label.path && (
        <>
          <span className="text-neutral-400">→</span>
          <span className="font-mono text-neutral-900">{label.extra}</span>
        </>
      )}
      {label.extra && !label.path && (
        <span className="font-mono text-neutral-900">{label.extra}</span>
      )}
    </div>
  );
}
