import { EnvironmentId, ProjectId, SourceControlProviderKind } from "@t3tools/contracts";
import { machineScopedProjectKey } from "@t3tools/client-runtime/state/project-grouping";
import {
  buildSidebarProjectSnapshots,
  resolveScopedProjectGroups,
  resolveSidebarProjectScopeKeys,
  type SidebarProjectSnapshot,
} from "../sidebarProjectGrouping";
import { reconcileProjectRailVisibility } from "../projectRailStore";
import { describe, expect, it } from "vite-plus/test";

import {
  buildProjectRailActivity,
  buildProjectRailEntries,
  buildProjectRailSelection,
  resolveAdjacentProjectKey,
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
): SidebarProjectSnapshot {
  const group = buildSidebarProjectSnapshots({
    projects: memberEnvironmentIds.map((memberEnvironmentId, index) => ({
      environmentId: memberEnvironmentId,
      id: ProjectId.make(`${projectKey}-${index}`),
      title: projectKey,
      workspaceRoot: `/work/${projectKey}-${index}`,
      defaultModelSelection: null,
      scripts: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    })),
    settings: { sidebarProjectGroupingMode: "separate", sidebarProjectGroupingOverrides: {} },
    primaryEnvironmentId: environmentId,
    resolveEnvironmentLabel: (id) => environmentLabelById.get(id) ?? null,
  });
  const representative =
    group.find((candidate) => candidate.environmentId === environmentId) ?? group[0]!;
  return {
    ...representative,
    projectKey,
    memberProjects: group.flatMap((candidate) => candidate.memberProjects),
    memberProjectRefs: group.flatMap((candidate) => candidate.memberProjectRefs),
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
  it("only offers No project on machines with their own scratch sessions", () => {
    const local = {
      ...makeGroup("scratch-local", localEnvironmentId).memberProjects[0]!,
      isScratch: true as const,
    };
    const remote = {
      ...makeGroup("scratch-remote", remoteAEnvironmentId).memberProjects[0]!,
      id: local.id,
      isScratch: true as const,
    };
    const ordinary = {
      ...makeGroup("ordinary", remoteAEnvironmentId).memberProjects[0]!,
      title: "No project",
    };
    const groups = buildSidebarProjectSnapshots({
      projects: [local, remote, ordinary],
      groupScratchProjects: true,
      settings: { sidebarProjectGroupingMode: "repository", sidebarProjectGroupingOverrides: {} },
      primaryEnvironmentId: localEnvironmentId,
      resolveEnvironmentLabel: (id) => environmentLabelById.get(id) ?? null,
    });
    const input = {
      groups,
      primaryEnvironmentId: localEnvironmentId,
      onlineEnvironmentIds: new Set([localEnvironmentId, remoteAEnvironmentId]),
      environmentLabelById,
      sessionProjectRefs: [{ environmentId: local.environmentId, projectId: local.id }],
    };
    const entries = buildProjectRailEntries(input);
    expect(
      entries.filter((entry) => entry.group.isScratch).map((entry) => entry.environmentId),
    ).toEqual([localEnvironmentId]);
    expect(entries.some((entry) => entry.group.id === ordinary.id)).toBe(true);
    expect(
      buildProjectRailEntries({ ...input, sessionProjectRefs: [] }).some(
        (entry) => entry.group.isScratch,
      ),
    ).toBe(false);
    expect(
      buildProjectRailEntries({
        ...input,
        sessionProjectRefs: [{ environmentId: remote.environmentId, projectId: remote.id }],
      })
        .filter((entry) => entry.group.isScratch)
        .map((entry) => entry.environmentId),
    ).toEqual([remoteAEnvironmentId]);
    const both = buildProjectRailEntries({
      ...input,
      sessionProjectRefs: [
        ...input.sessionProjectRefs,
        { environmentId: remote.environmentId, projectId: remote.id },
      ],
    });
    expect(
      both.filter((entry) => entry.group.isScratch).map((entry) => entry.environmentId),
    ).toEqual([localEnvironmentId, remoteAEnvironmentId]);
  });

  it("keeps shared repositories on each machine and initializes three logical entries", () => {
    const projects = [
      [localEnvironmentId, "a1", "a"],
      [localEnvironmentId, "a2", "a"],
      [localEnvironmentId, "a3", "a"],
      [localEnvironmentId, "b", "b"],
      [localEnvironmentId, "c", "c"],
      [localEnvironmentId, "d", "d"],
      [remoteAEnvironmentId, "old-a", "a"],
      [remoteAEnvironmentId, "remote-a", "a"],
    ] as const;
    const groups = buildSidebarProjectSnapshots({
      projects: projects.map(([environmentId, id, repository]) => ({
        environmentId,
        id: ProjectId.make(id),
        title: repository,
        archivedAt: id === "old-a" ? "2026-02-01T00:00:00Z" : null,
        workspaceRoot: `/work/${id}`,
        repositoryIdentity: {
          canonicalKey: `github.com/test/${repository}`,
          locator: {
            source: "git-remote",
            remoteName: "origin",
            remoteUrl: `https://github.com/test/${repository}.git`,
          },
          provider: SourceControlProviderKind.make("github"),
          owner: "test",
          name: repository,
          displayName: repository,
        },
        defaultModelSelection: null,
        scripts: [],
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      })),
      settings: { sidebarProjectGroupingMode: "repository", sidebarProjectGroupingOverrides: {} },
      primaryEnvironmentId: localEnvironmentId,
      resolveEnvironmentLabel: (id) => environmentLabelById.get(id) ?? null,
    });
    const entries = buildProjectRailEntries({
      groups,
      primaryEnvironmentId: localEnvironmentId,
      onlineEnvironmentIds: new Set([localEnvironmentId]),
      environmentLabelById,
      sessionProjectRefs: [],
    });
    const remote = entries.find((entry) => entry.environmentId === remoteAEnvironmentId)!;
    const keys = resolveSidebarProjectScopeKeys({
      groups,
      keys: [remote.key],
      canClearMissingScope: true,
    });
    expect(keys).toEqual([remote.key]);
    expect(
      resolveScopedProjectGroups({ groups, keys, primaryEnvironmentId: localEnvironmentId })[0]
        ?.workspaceRoot,
    ).toBe("/work/remote-a");
    expect(
      resolveScopedProjectGroups({
        groups,
        keys,
        primaryEnvironmentId: localEnvironmentId,
      }).flatMap((group) => group.memberProjectRefs),
    ).toEqual(remote.group.memberProjectRefs);
    expect([
      ...buildProjectRailSelection({
        selectedProjectKeys: keys,
        entries,
      }),
    ]).toEqual([[remote.key, "single"]]);
    const visibility = reconcileProjectRailVisibility(
      {},
      entries.map((entry) => entry.group),
    );
    expect(visibility[localEnvironmentId]?.visibility).toEqual({
      a1: true,
      a2: true,
      a3: true,
      b: true,
      c: true,
      d: false,
    });
    expect(visibility[remoteAEnvironmentId]?.visibility).toEqual({
      "old-a": true,
      "remote-a": true,
    });
    expect(entries.filter((entry) => entry.environmentId === remoteAEnvironmentId)).toHaveLength(1);
    expect(entries.find((entry) => entry.environmentId === remoteAEnvironmentId)?.offline).toBe(
      true,
    );
    expect(
      entries.find((entry) => entry.environmentId === remoteAEnvironmentId)?.group.workspaceRoot,
    ).toBe("/work/remote-a");
  });

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
      sessionProjectRefs: [],
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

  it("keeps online and offline copies of a shared repository independently addressable", () => {
    const shared = makeGroup("mixed", remoteAEnvironmentId, [
      localEnvironmentId,
      remoteAEnvironmentId,
      remoteAEnvironmentId,
    ]);
    const mixed = {
      ...shared,
      memberProjects: shared.memberProjects.map((member, index) =>
        index === 1 ? { ...member, archivedAt: "2026-01-02T00:00:00Z" } : member,
      ),
    };
    const remoteOnly = makeGroup("remote", remoteBEnvironmentId);
    const entries = buildProjectRailEntries({
      groups: [mixed, remoteOnly],
      primaryEnvironmentId: localEnvironmentId,
      onlineEnvironmentIds: new Set([localEnvironmentId]),
      environmentLabelById,
      sessionProjectRefs: [],
    });
    expect(entries.map((entry) => [entry.environmentId, entry.offline])).toEqual([
      [localEnvironmentId, false],
      [remoteAEnvironmentId, true],
      [remoteBEnvironmentId, true],
    ]);
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(3);
    expect(entries.filter((entry) => entry.group.projectKey === "mixed")).toHaveLength(2);
    expect(entries.find((entry) => entry.environmentId === remoteAEnvironmentId)?.group.id).toBe(
      "mixed-2",
    );
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
  const selectionEntry = (key: string, projectKey: string) => ({ key, group: { projectKey } });

  it("marks a single selected key as single and several as multi", () => {
    const single = buildProjectRailSelection({
      selectedProjectKeys: ["a"],
      entries: [selectionEntry("entry-a", "a")],
    });
    expect(single.get("entry-a")).toBe("single");
    const multi = buildProjectRailSelection({
      selectedProjectKeys: ["a", "b"],
      entries: [selectionEntry("entry-a", "a"), selectionEntry("entry-b", "b")],
    });
    expect(multi.get("entry-a")).toBe("multi");
    expect(multi.get("entry-b")).toBe("multi");
  });

  it("scopes a machine-qualified scratch selection to that machine's entry", () => {
    const local = selectionEntry(
      machineScopedProjectKey("\0no-project", localEnvironmentId),
      "\0no-project",
    );
    const remote = selectionEntry(
      machineScopedProjectKey("\0no-project", remoteAEnvironmentId),
      "\0no-project",
    );
    const machineScoped = buildProjectRailSelection({
      selectedProjectKeys: [remote.key],
      entries: [local, remote],
    });
    expect(machineScoped.get(remote.key)).toBe("single");
    expect(machineScoped.has(local.key)).toBe(false);
    const logical = buildProjectRailSelection({
      selectedProjectKeys: ["\0no-project"],
      entries: [local, remote],
    });
    expect(logical.get(local.key)).toBe("single");
    expect(logical.get(remote.key)).toBe("single");
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
