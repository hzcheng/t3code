import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildProjectRailActivity,
  buildProjectRailEntries,
  buildProjectRailSelection,
  resolveAdjacentProjectKey,
  type ProjectRailGroupShape,
  type ProjectRailThreadInput,
} from "./ProjectRail.logic";

const localEnvironmentId = EnvironmentId.make("env-local");
const remoteAEnvironmentId = EnvironmentId.make("env-remote-a");
const remoteBEnvironmentId = EnvironmentId.make("env-remote-b");

const environmentLabelById = new Map([
  [localEnvironmentId, "This Mac"],
  [remoteAEnvironmentId, "Alpha box"],
  [remoteBEnvironmentId, "Beta box"],
]);

function makeGroup(
  projectKey: string,
  environmentId: EnvironmentId,
  memberEnvironmentIds: readonly EnvironmentId[] = [environmentId],
): ProjectRailGroupShape {
  return {
    projectKey,
    environmentId,
    memberProjectRefs: memberEnvironmentIds.map((memberEnvironmentId, index) => ({
      environmentId: memberEnvironmentId,
      projectId: ProjectId.make(`${projectKey}-${index}`),
    })),
  };
}

function makeThread(overrides: Partial<ProjectRailThreadInput> = {}): ProjectRailThreadInput {
  return {
    environmentId: localEnvironmentId,
    projectId: ProjectId.make("alpha-0"),
    archivedAt: null,
    deletedAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    runtime: null,
    latestRun: null,
    ...overrides,
  };
}

describe("buildProjectRailEntries", () => {
  it("clusters icons by machine, primary environment first, remotes alphabetical", () => {
    const groups = [
      makeGroup("beta-1", remoteBEnvironmentId),
      makeGroup("local-1", localEnvironmentId),
      makeGroup("alpha-1", remoteAEnvironmentId),
      makeGroup("local-2", localEnvironmentId),
      makeGroup("alpha-2", remoteAEnvironmentId),
    ];
    const entries = buildProjectRailEntries({
      groups,
      primaryEnvironmentId: localEnvironmentId,
      onlineEnvironmentIds: new Set([
        localEnvironmentId,
        remoteAEnvironmentId,
        remoteBEnvironmentId,
      ]),
      environmentLabelById,
    });
    expect(entries.map((entry) => entry.group.projectKey)).toEqual([
      "local-1",
      "local-2",
      "alpha-1",
      "alpha-2",
      "beta-1",
    ]);
    expect(entries.map((entry) => entry.dividerBefore)).toEqual([false, false, true, false, true]);
  });

  it("marks a group offline only when every member environment is disconnected", () => {
    const mixed = makeGroup("mixed", remoteAEnvironmentId, [
      localEnvironmentId,
      remoteAEnvironmentId,
    ]);
    const remoteOnly = makeGroup("remote", remoteBEnvironmentId);
    const entries = buildProjectRailEntries({
      groups: [mixed, remoteOnly],
      primaryEnvironmentId: localEnvironmentId,
      onlineEnvironmentIds: new Set([localEnvironmentId]),
      environmentLabelById,
    });
    const byKey = new Map(entries.map((entry) => [entry.group.projectKey, entry.offline]));
    expect(byKey.get("mixed")).toBe(false);
    expect(byKey.get("remote")).toBe(true);
  });
});

describe("buildProjectRailActivity", () => {
  const groups = [makeGroup("alpha", localEnvironmentId)];

  it("prefers attention over working within one project", () => {
    const activity = buildProjectRailActivity({
      groups,
      threads: [
        makeThread({ runtime: { status: "running" } }),
        makeThread({ hasPendingApprovals: true }),
      ],
    });
    expect(activity.get("alpha")).toBe("attention");
  });

  it("flags pending user input and subagent requests as attention", () => {
    const activity = buildProjectRailActivity({
      groups,
      threads: [makeThread({ pendingSubagentRequest: "user_input" })],
    });
    expect(activity.get("alpha")).toBe("attention");
  });

  it("treats a wait-blocked run as idle, not working", () => {
    const activity = buildProjectRailActivity({
      groups,
      threads: [makeThread({ runtime: { status: "running" }, blockedOnThreadWait: true })],
    });
    expect(activity.get("alpha")).toBeUndefined();
  });

  it("flags a run completed after the last visit as done", () => {
    const activity = buildProjectRailActivity({
      groups,
      threads: [
        makeThread({
          latestRun: { completedAt: "2026-01-02T00:00:00Z" },
          lastVisitedAt: "2026-01-01T00:00:00Z",
        }),
      ],
    });
    expect(activity.get("alpha")).toBe("done");
  });

  it("does not flag completions already seen or never visitable", () => {
    const activity = buildProjectRailActivity({
      groups,
      threads: [
        makeThread({
          latestRun: { completedAt: "2026-01-01T00:00:00Z" },
          lastVisitedAt: "2026-01-02T00:00:00Z",
        }),
        makeThread({
          projectId: ProjectId.make("alpha-0"),
          latestRun: { completedAt: "2026-01-03T00:00:00Z" },
          lastVisitedAt: null,
        }),
      ],
    });
    expect(activity.get("alpha")).toBeUndefined();
  });

  it("prefers working over done within one project", () => {
    const activity = buildProjectRailActivity({
      groups,
      threads: [
        makeThread({
          latestRun: { completedAt: "2026-01-02T00:00:00Z" },
          lastVisitedAt: "2026-01-01T00:00:00Z",
        }),
        makeThread({ runtime: { status: "running" } }),
      ],
    });
    expect(activity.get("alpha")).toBe("working");
  });

  it("ignores archived threads and threads outside the rail's projects", () => {
    const activity = buildProjectRailActivity({
      groups,
      threads: [
        makeThread({ runtime: { status: "running" }, archivedAt: "2026-01-01T00:00:00Z" }),
        makeThread({
          projectId: ProjectId.make("elsewhere"),
          hasPendingApprovals: true,
        }),
      ],
    });
    expect(activity.size).toBe(0);
  });
});

describe("buildProjectRailSelection", () => {
  it("marks a single selected key as single and several as multi", () => {
    expect(buildProjectRailSelection({ selectedProjectKeys: ["a"] }).get("a")).toBe("single");
    const multi = buildProjectRailSelection({ selectedProjectKeys: ["a", "b"] });
    expect(multi.get("a")).toBe("multi");
    expect(multi.get("b")).toBe("multi");
  });
});

describe("resolveAdjacentProjectKey", () => {
  const keys = ["a", "b", "c"];

  it("steps forward and backward through the rail order", () => {
    expect(
      resolveAdjacentProjectKey({ projectKeys: keys, currentProjectKey: "a", direction: "next" }),
    ).toBe("b");
    expect(
      resolveAdjacentProjectKey({
        projectKeys: keys,
        currentProjectKey: "b",
        direction: "previous",
      }),
    ).toBe("a");
  });

  it("wraps at both ends", () => {
    expect(
      resolveAdjacentProjectKey({ projectKeys: keys, currentProjectKey: "c", direction: "next" }),
    ).toBe("a");
    expect(
      resolveAdjacentProjectKey({
        projectKeys: keys,
        currentProjectKey: "a",
        direction: "previous",
      }),
    ).toBe("c");
  });

  it("starts at the first or last icon without an anchor", () => {
    expect(
      resolveAdjacentProjectKey({ projectKeys: keys, currentProjectKey: null, direction: "next" }),
    ).toBe("a");
    expect(
      resolveAdjacentProjectKey({
        projectKeys: keys,
        currentProjectKey: "missing",
        direction: "previous",
      }),
    ).toBe("c");
    expect(
      resolveAdjacentProjectKey({ projectKeys: [], currentProjectKey: null, direction: "next" }),
    ).toBeNull();
  });
});
