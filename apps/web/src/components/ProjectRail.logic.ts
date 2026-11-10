import type { EnvironmentId, ProjectId, ScopedProjectRef } from "@t3tools/contracts";

export interface ProjectRailGroupShape {
  readonly projectKey: string;
  /** The machine this icon represents: the group's representative environment. */
  readonly environmentId: EnvironmentId;
  readonly memberProjectRefs: ReadonlyArray<ScopedProjectRef>;
}

export interface ProjectRailEntry<TGroup extends ProjectRailGroupShape = ProjectRailGroupShape> {
  readonly group: TGroup;
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string | null;
  /** Offline means every member project's environment is disconnected. */
  readonly offline: boolean;
  /** True on the first entry of each machine cluster. */
  readonly dividerBefore: boolean;
}

/**
 * Rail order: icons cluster by machine so one machine's projects sit together.
 * The primary environment leads, other machines follow alphabetically; groups
 * keep their sidebar order within a cluster.
 */
export function buildProjectRailEntries<TGroup extends ProjectRailGroupShape>(input: {
  readonly groups: readonly TGroup[];
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly onlineEnvironmentIds: ReadonlySet<EnvironmentId>;
  readonly environmentLabelById: ReadonlyMap<EnvironmentId, string>;
}): ProjectRailEntry<TGroup>[] {
  const clusterOrder = new Map<EnvironmentId, number>();
  const clusterKeys = [...new Set(input.groups.map((group) => group.environmentId))].sort(
    (a, b) => {
      if (a === input.primaryEnvironmentId) return -1;
      if (b === input.primaryEnvironmentId) return 1;
      const labelCompare = (input.environmentLabelById.get(a) ?? "").localeCompare(
        input.environmentLabelById.get(b) ?? "",
      );
      return labelCompare !== 0 ? labelCompare : String(a).localeCompare(String(b));
    },
  );
  clusterKeys.forEach((environmentId, index) => clusterOrder.set(environmentId, index));

  const ordered = input.groups
    .map((group, index) => ({ group, index }))
    .sort(
      (a, b) =>
        (clusterOrder.get(a.group.environmentId) ?? 0) -
          (clusterOrder.get(b.group.environmentId) ?? 0) || a.index - b.index,
    );

  return ordered.map(({ group }, orderedIndex) => ({
    group,
    environmentId: group.environmentId,
    environmentLabel: input.environmentLabelById.get(group.environmentId) ?? null,
    offline: group.memberProjectRefs.every(
      (projectRef) => !input.onlineEnvironmentIds.has(projectRef.environmentId),
    ),
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
}): ReadonlyMap<string, ProjectRailSelection> {
  const kind: ProjectRailSelection = input.selectedProjectKeys.length > 1 ? "multi" : "single";
  return new Map(input.selectedProjectKeys.map((key) => [key, kind] as const));
}
