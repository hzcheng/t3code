import type { EnvironmentId, ScopedProjectRef } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

type MachineVisibility = {
  readonly initialized: boolean;
  readonly visibility: Readonly<Record<string, boolean>>;
};
type RailVisibility = Readonly<Record<string, MachineVisibility>>;
type VisibilityGroup = {
  readonly environmentId: EnvironmentId;
  readonly memberProjectRefs: readonly ScopedProjectRef[];
};

export function reconcileProjectRailVisibility(
  current: RailVisibility,
  groups: readonly VisibilityGroup[],
  snapshotEnvironmentIds: readonly EnvironmentId[] = groups.map((group) => group.environmentId),
): RailVisibility {
  const groupsByEnvironment = new Map<string, VisibilityGroup[]>(
    snapshotEnvironmentIds.map((id) => [id, []]),
  );
  for (const group of groups) {
    const entries = groupsByEnvironment.get(group.environmentId) ?? [];
    entries.push(group);
    groupsByEnvironment.set(group.environmentId, entries);
  }
  const ready = new Set<string>(snapshotEnvironmentIds);
  let next: Record<string, MachineVisibility> | undefined;
  for (const [environmentId, entries] of groupsByEnvironment) {
    const previous = current[environmentId];
    if (!previous?.initialized && !ready.has(environmentId)) continue;
    if (
      previous?.initialized &&
      entries.every((entry) =>
        entry.memberProjectRefs.every((ref) => ref.projectId in previous.visibility),
      )
    )
      continue;
    const visibility = { ...previous?.visibility };
    for (const [index, entry] of entries.entries()) {
      for (const ref of entry.memberProjectRefs) {
        visibility[ref.projectId] ??= previous?.initialized !== true && index < 3;
      }
    }
    next ??= { ...current };
    next[environmentId] = { initialized: true, visibility };
  }
  return next ?? current;
}

interface ProjectRailState {
  readonly byEnvironment: RailVisibility;
  readonly reconcile: (
    groups: readonly VisibilityGroup[],
    snapshotEnvironmentIds?: readonly EnvironmentId[],
  ) => void;
  readonly setVisible: (projects: readonly ScopedProjectRef[], visible: boolean) => void;
}

function restoreVisibility(value: unknown): RailVisibility {
  if (!value || typeof value !== "object" || !("byEnvironment" in value)) return {};
  const byEnvironment = value.byEnvironment;
  if (!byEnvironment || typeof byEnvironment !== "object") return {};
  return Object.fromEntries(
    Object.entries(byEnvironment).flatMap(([id, machine]) => {
      if (
        !machine ||
        typeof machine !== "object" ||
        typeof machine.initialized !== "boolean" ||
        !machine.visibility ||
        typeof machine.visibility !== "object"
      )
        return [];
      return [
        [
          id,
          {
            initialized: machine.initialized,
            visibility: Object.fromEntries(
              Object.entries(machine.visibility).filter(
                (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
              ),
            ),
          },
        ],
      ];
    }),
  );
}

export const useProjectRailStore = create<ProjectRailState>()(
  persist(
    (set, get) => ({
      byEnvironment: {},
      reconcile: (groups, snapshotEnvironmentIds) => {
        const current = get().byEnvironment;
        const next = reconcileProjectRailVisibility(current, groups, snapshotEnvironmentIds);
        if (next !== current) set({ byEnvironment: next });
      },
      setVisible: (projects, visible) => {
        const state = get();
        const updates = new Map<string, Record<string, boolean>>();
        for (const ref of projects) {
          let visibility = updates.get(ref.environmentId);
          const previous = state.byEnvironment[ref.environmentId];
          if ((visibility ?? previous?.visibility)?.[ref.projectId] === visible) continue;
          if (!visibility) {
            visibility = { ...previous?.visibility };
            updates.set(ref.environmentId, visibility);
          }
          visibility[ref.projectId] = visible;
        }
        if (updates.size === 0) return;
        const next = { ...state.byEnvironment };
        for (const [environmentId, visibility] of updates) {
          next[environmentId] = {
            initialized: state.byEnvironment[environmentId]?.initialized ?? false,
            visibility,
          };
        }
        set({ byEnvironment: next });
      },
    }),
    {
      name: "t3code:project-rail:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ byEnvironment: state.byEnvironment }),
      merge: (persisted, state) => ({ ...state, byEnvironment: restoreVisibility(persisted) }),
    },
  ),
);
