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

export type ProjectRailActivity = "attention" | "working" | null;

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
}

function classifyRailThread(
  thread: Pick<
    ProjectRailThreadInput,
    | "hasPendingApprovals"
    | "hasPendingUserInput"
    | "pendingSubagentRequest"
    | "runtime"
    | "blockedOnThreadWait"
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
  return null;
}

/**
 * One dot per rail icon: amber while any of the project's threads waits on the
 * user (approval or input), sky while any is actively working.
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
    if (activityByProjectKey.get(projectKey) === "attention") continue;
    const activity = classifyRailThread(thread);
    if (activity === null) continue;
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
