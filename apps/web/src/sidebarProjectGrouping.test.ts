import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import {
  machineScopedProjectKey,
  parseMachineScopedProjectKey,
} from "@t3tools/client-runtime/state/project-grouping";
import { describe, expect, it } from "vite-plus/test";

import {
  buildSidebarProjectSnapshots,
  resolveScopedProjectGroups,
  resolveSidebarProjectScopeKeys,
  toggleSidebarProjectScope,
  logicalSidebarProjectKey,
} from "./sidebarProjectGrouping";
import type { Project } from "./types";

const localEnvironmentId = EnvironmentId.make("env-local");
const remoteEnvironmentId = EnvironmentId.make("env-remote");

function makeScratch(environmentId: EnvironmentId, id: string): Project {
  return {
    environmentId,
    id: ProjectId.make(id),
    title: "No project",
    workspaceRoot: `/scratch/${environmentId}`,
    isScratch: true,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  } as Project;
}

function makeOrdinary(environmentId: EnvironmentId, id: string): Project {
  return {
    environmentId,
    id: ProjectId.make(id),
    title: id,
    workspaceRoot: `/work/${id}`,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  } as Project;
}

const projects = [
  makeScratch(localEnvironmentId, "scratch-local"),
  makeScratch(remoteEnvironmentId, "scratch-remote"),
  makeOrdinary(localEnvironmentId, "app"),
];

function groups() {
  return buildSidebarProjectSnapshots({
    projects,
    groupScratchProjects: true,
    settings: { sidebarProjectGroupingMode: "repository", sidebarProjectGroupingOverrides: {} },
    primaryEnvironmentId: localEnvironmentId,
    resolveEnvironmentLabel: (environmentId) =>
      environmentId === remoteEnvironmentId ? "Remote box" : "This Mac",
  });
}

describe("machine-scoped scratch scope keys", () => {
  it("round-trips the environment id", () => {
    const key = machineScopedProjectKey("\0no-project", remoteEnvironmentId);
    expect(parseMachineScopedProjectKey(key)?.environmentId).toBe(remoteEnvironmentId);
    // The logical all-machines key and ordinary keys stay unqualified.
    expect(parseMachineScopedProjectKey("\0no-project")).toBeNull();
    expect(parseMachineScopedProjectKey("app")).toBeNull();
  });

  it("keeps a machine-scoped scratch key while its machine has a scratch project", () => {
    const key = machineScopedProjectKey("\0no-project", remoteEnvironmentId);
    expect(
      resolveSidebarProjectScopeKeys({ groups: groups(), keys: [key], canClearMissingScope: true }),
    ).toEqual([key]);
  });

  it("clears a machine-scoped scratch key once that machine has no scratch project", () => {
    const key = machineScopedProjectKey("\0no-project", EnvironmentId.make("env-gone"));
    expect(
      resolveSidebarProjectScopeKeys({ groups: groups(), keys: [key], canClearMissingScope: true }),
    ).toEqual([]);
    expect(
      resolveSidebarProjectScopeKeys({
        groups: groups(),
        keys: [key],
        canClearMissingScope: false,
      }),
    ).toEqual([key]);
  });

  it("scopes thread filtering to the selected machine's scratch members", () => {
    const key = machineScopedProjectKey("\0no-project", remoteEnvironmentId);
    const selected = resolveScopedProjectGroups({
      groups: groups(),
      keys: [key],
      primaryEnvironmentId: localEnvironmentId,
      resolveEnvironmentLabel: (environmentId) =>
        environmentId === remoteEnvironmentId ? "Remote box" : "This Mac",
    });
    expect(selected).toHaveLength(1);
    const scratch = selected[0]!;
    expect(scratch.projectKey).toBe(key);
    expect(scratch.displayName).toBe("No project · Remote box");
    expect(scratch.environmentId).toBe(remoteEnvironmentId);
    expect(scratch.memberProjectRefs).toEqual([
      { environmentId: remoteEnvironmentId, projectId: "scratch-remote" },
    ]);
  });

  it("keeps the logical scratch group selecting every machine's members", () => {
    const scratch = groups().find((group) => group.isScratch)!;
    const selected = resolveScopedProjectGroups({
      groups: groups(),
      keys: [scratch.projectKey],
      primaryEnvironmentId: localEnvironmentId,
    });
    expect(selected).toHaveLength(1);
    expect(selected[0]!.memberProjectRefs).toHaveLength(2);
  });

  it("selects ordinary groups and machine-scoped scratch together", () => {
    const ordinary = groups().find((group) => !group.isScratch)!;
    const selected = resolveScopedProjectGroups({
      groups: groups(),
      keys: [ordinary.projectKey, machineScopedProjectKey("\0no-project", localEnvironmentId)],
      primaryEnvironmentId: localEnvironmentId,
    });
    expect(selected.map((group) => group.projectKey).sort()).toEqual(
      [ordinary.projectKey, machineScopedProjectKey("\0no-project", localEnvironmentId)].sort(),
    );
  });
});

it("toggles a machine covered by a repository filter and preserves other projects", () => {
  const [scratch] = groups().filter((group) => group.isScratch);
  const group = scratch!;
  const local = machineScopedProjectKey(group.projectKey, localEnvironmentId);
  const remote = machineScopedProjectKey(group.projectKey, remoteEnvironmentId);
  expect(
    toggleSidebarProjectScope(["other", group.projectKey, remote], group, remoteEnvironmentId),
  ).toEqual(["other", local]);
  expect(toggleSidebarProjectScope(["other", local], group, remoteEnvironmentId)).toEqual([
    "other",
    local,
    remote,
  ]);
  expect(toggleSidebarProjectScope(["other", local, remote], group)).toEqual(["other"]);
  expect(logicalSidebarProjectKey(local)).toBe(group.projectKey);
});
