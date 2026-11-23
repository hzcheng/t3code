import type { EnvironmentId, ProjectId, ScopedProjectRef } from "@t3tools/contracts";
import { machineScopedProjectKey } from "@t3tools/client-runtime/state/project-grouping";
import type { SidebarProjectSnapshot, SidebarProjectGroupMember } from "../sidebarProjectGrouping";

export interface ProjectRailGroupShape {
  readonly projectKey: string;
  /** Sidebar scope remains logical; each rail entry targets one machine. */
  readonly environmentId: EnvironmentId;
  readonly memberProjectRefs: ReadonlyArray<ScopedProjectRef>;
}

export interface ProjectRailEntry<TGroup extends ProjectRailGroupShape = ProjectRailGroupShape> {
  readonly group: TGroup;
  readonly key: string;
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string | null;
  /** Whether this entry's machine is disconnected. */
  readonly offline: boolean;
  /** True on the first entry of each machine cluster. */
  readonly dividerBefore: boolean;
}

/**
 * Rail order: icons cluster by machine so one machine's projects sit together.
 * The primary environment leads, other machines follow alphabetically; groups
 * keep their sidebar order within a cluster.
 */
export function buildProjectRailEntries(input: {
  readonly groups: readonly SidebarProjectSnapshot[];
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly onlineEnvironmentIds: ReadonlySet<EnvironmentId>;
  readonly environmentLabelById: ReadonlyMap<EnvironmentId, string>;
  readonly sessionProjectRefs: readonly ScopedProjectRef[];
}): ProjectRailEntry<SidebarProjectSnapshot>[] {
  const sessionProjectKeys = new Set(
    input.sessionProjectRefs.map((ref) => `${ref.environmentId}:${ref.projectId}`),
  );
  const groups = input.groups.flatMap((group) => {
    const membersByEnvironment = new Map<EnvironmentId, SidebarProjectGroupMember[]>();
    for (const member of group.memberProjects) {
      const members = membersByEnvironment.get(member.environmentId) ?? [];
      members.push(member);
      membersByEnvironment.set(member.environmentId, members);
    }
    return [...membersByEnvironment].flatMap(([environmentId, members]) => {
      const active = members.filter((member) => member.archivedAt == null);
      if (active.length === 0) return [];
      if (
        group.isScratch &&
        !active.some((member) => sessionProjectKeys.has(`${environmentId}:${member.id}`))
      )
        return [];
      const representative = active.find((member) => member.id === group.id) ?? active[0]!;
      const local = environmentId === input.primaryEnvironmentId;
      return [
        {
          ...group,
          ...representative,
          groupedProjectCount: members.length,
          environmentPresence: local ? ("local-only" as const) : ("remote-only" as const),
          memberProjects: members,
          memberProjectRefs: group.memberProjectRefs.filter(
            (ref) => ref.environmentId === environmentId,
          ),
          remoteEnvironmentLabels:
            local || !representative.environmentLabel ? [] : [representative.environmentLabel],
          pinned: members.some((member) => member.pinnedAt != null),
          archived: false,
        },
      ];
    });
  });
  const clusterOrder = new Map<EnvironmentId, number>();
  const clusterKeys = [...new Set(groups.map((group) => group.environmentId))].sort((a, b) => {
    if (a === input.primaryEnvironmentId) return -1;
    if (b === input.primaryEnvironmentId) return 1;
    const labelCompare = (input.environmentLabelById.get(a) ?? "").localeCompare(
      input.environmentLabelById.get(b) ?? "",
    );
    return labelCompare !== 0 ? labelCompare : String(a).localeCompare(String(b));
  });
  clusterKeys.forEach((environmentId, index) => clusterOrder.set(environmentId, index));

  const ordered = groups
    .map((group, index) => ({ group, index }))
    .sort(
      (a, b) =>
        (clusterOrder.get(a.group.environmentId) ?? 0) -
          (clusterOrder.get(b.group.environmentId) ?? 0) || a.index - b.index,
    );

  return ordered.map(({ group }, orderedIndex) => ({
    group,
    key: machineScopedProjectKey(group.projectKey, group.environmentId),
    environmentId: group.environmentId,
    environmentLabel: input.environmentLabelById.get(group.environmentId) ?? null,
    offline: !input.onlineEnvironmentIds.has(group.environmentId),
    dividerBefore:
      orderedIndex > 0 && ordered[orderedIndex - 1]!.group.environmentId !== group.environmentId,
  }));
}

export type ProjectRailActivity = "attention" | "working" | "done" | null;

export interface ProjectRailThreadInput {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly archivedAt: string | null;
  readonly deletedAt: string | null;
  readonly hasPendingApprovals: boolean;
  readonly hasPendingUserInput: boolean;
  readonly pendingSubagentRequest?: string | null | undefined;
  readonly runtime: { readonly status: string } | null;
  readonly blockedOnThreadWait?: boolean | undefined;
  readonly latestRun: { readonly completedAt: string | null } | null;
  readonly lastVisitedAt?: string | null | undefined;
}

// Mirrors hasUnseenCompletion in Sidebar.logic.ts: completions only count once
// the thread was visited at least once.
function hasUnseenCompletion(
  thread: Pick<ProjectRailThreadInput, "latestRun" | "lastVisitedAt">,
): boolean {
  if (!thread.latestRun?.completedAt) return false;
  const completedAt = Date.parse(thread.latestRun.completedAt);
  if (Number.isNaN(completedAt)) return false;
  if (!thread.lastVisitedAt) return false;
  const lastVisitedAt = Date.parse(thread.lastVisitedAt);
  if (Number.isNaN(lastVisitedAt)) return true;
  return completedAt > lastVisitedAt;
}

function classifyRailThread(
  thread: Pick<
    ProjectRailThreadInput,
    | "hasPendingApprovals"
    | "hasPendingUserInput"
    | "pendingSubagentRequest"
    | "runtime"
    | "blockedOnThreadWait"
    | "latestRun"
    | "lastVisitedAt"
  >,
): Exclude<ProjectRailActivity, null> | null {
  if (
    thread.hasPendingApprovals ||
    thread.pendingSubagentRequest === "approval" ||
    thread.hasPendingUserInput ||
    thread.pendingSubagentRequest === "user_input"
  ) {
    return "attention";
  }
  const status = thread.runtime?.status;
  if (
    (status === "running" && thread.blockedOnThreadWait !== true) ||
    status === "waiting" ||
    status === "preparing" ||
    status === "starting" ||
    status === "queued"
  ) {
    return "working";
  }
  if (hasUnseenCompletion(thread)) return "done";
  return null;
}

/**
 * One dot per rail icon, highest priority first: amber while any thread waits
 * on the user (approval or input), sky while any is working, green for a
 * completed run nobody has opened since.
 */
export function buildProjectRailActivity(input: {
  readonly groups: readonly ProjectRailGroupShape[];
  readonly threads: ReadonlyArray<ProjectRailThreadInput>;
}): ReadonlyMap<string, ProjectRailActivity> {
  const projectKeyByPhysicalKey = new Map<string, string>();
  for (const group of input.groups) {
    for (const projectRef of group.memberProjectRefs) {
      projectKeyByPhysicalKey.set(
        `${projectRef.environmentId}:${projectRef.projectId}`,
        group.projectKey,
      );
    }
  }

  const activityByProjectKey = new Map<string, ProjectRailActivity>();
  for (const thread of input.threads) {
    if (thread.archivedAt !== null || thread.deletedAt !== null) continue;
    const projectKey = projectKeyByPhysicalKey.get(`${thread.environmentId}:${thread.projectId}`);
    if (projectKey === undefined) continue;
    const activity = classifyRailThread(thread);
    if (activity === null) continue;
    const current = activityByProjectKey.get(projectKey);
    if (current === "attention" || (current === "working" && activity !== "attention")) {
      continue;
    }
    activityByProjectKey.set(projectKey, activity);
  }
  return activityByProjectKey;
}

export type ProjectRailSelection = "single" | "multi";

export function buildProjectRailSelection(input: {
  readonly selectedProjectKeys: readonly string[];
  readonly entries: ReadonlyArray<{
    readonly key: string;
    readonly group: { readonly projectKey: string };
  }>;
}): ReadonlyMap<string, ProjectRailSelection> {
  const selected = new Set(input.selectedProjectKeys);
  const kind: ProjectRailSelection = input.selectedProjectKeys.length > 1 ? "multi" : "single";
  const map = new Map<string, ProjectRailSelection>();
  for (const entry of input.entries) {
    if (selected.has(entry.group.projectKey) || selected.has(entry.key)) {
      map.set(entry.key, kind);
    }
  }
  return map;
}

export type ProjectRailDirection = "previous" | "next";

/**
 * Keyboard cycling through the rail's projects, wrapping at both ends. With no
 * anchor (sidebar showing all projects), next starts at the first icon and
 * previous at the last.
 */
export function resolveAdjacentProjectKey(input: {
  readonly projectKeys: readonly string[];
  readonly currentProjectKey: string | null;
  readonly direction: ProjectRailDirection;
}): string | null {
  const count = input.projectKeys.length;
  if (count === 0) return null;
  const currentIndex = input.currentProjectKey
    ? input.projectKeys.indexOf(input.currentProjectKey)
    : -1;
  if (currentIndex === -1) {
    return input.direction === "next"
      ? (input.projectKeys[0] ?? null)
      : (input.projectKeys[count - 1] ?? null);
  }
  const offset = input.direction === "next" ? 1 : -1;
  return input.projectKeys[(currentIndex + offset + count) % count] ?? null;
}
