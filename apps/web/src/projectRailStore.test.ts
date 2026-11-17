import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { reconcileProjectRailVisibility, useProjectRailStore } from "./projectRailStore";

const local = EnvironmentId.make("rail-local");
const remote = EnvironmentId.make("rail-remote");
const ref = (environmentId: EnvironmentId, id: string) => ({
  environmentId,
  projectId: ProjectId.make(id),
});
const projects = ["a", "b", "c", "d"].map((id) => ref(local, id));
const groups = (refs: readonly ReturnType<typeof ref>[]) =>
  refs.map((project) => ({
    environmentId: project.environmentId,
    memberProjectRefs: [project],
  }));

describe("project rail visibility", () => {
  it("initializes three per machine once, without filling gaps or revealing later discoveries", () => {
    const initial = reconcileProjectRailVisibility({}, groups([...projects, ref(remote, "a")]));
    expect(initial[local]?.visibility).toEqual({ a: true, b: true, c: true, d: false });
    expect(initial[remote]?.visibility).toEqual({ a: true });
    const hidden = {
      ...initial,
      [local]: { initialized: true, visibility: { a: false, b: false, c: false, d: false } },
    };
    const updated = reconcileProjectRailVisibility(hidden, groups([...projects, ref(local, "e")]));
    expect(updated[local]?.visibility).toEqual({
      a: false,
      b: false,
      c: false,
      d: false,
      e: false,
    });
    expect(updated[remote]).toEqual(initial[remote]);
    expect(reconcileProjectRailVisibility(updated, groups(projects))).toBe(updated);
  });

  it("keeps client-created projects visible, even before a machine's first snapshot", () => {
    const store = useProjectRailStore;
    const previous = store.getState();
    try {
      store.setState({ byEnvironment: {} });
      store.getState().setVisible([ref(local, "new")], true);
      store.getState().reconcile(groups([...projects, ref(local, "new")]));
      expect(store.getState().byEnvironment[local]?.visibility).toEqual({
        a: true,
        b: true,
        c: true,
        d: false,
        new: true,
      });
      store.getState().setVisible(projects, true);
      expect(Object.values(store.getState().byEnvironment[local]!.visibility).every(Boolean)).toBe(
        true,
      );
      store.getState().setVisible([...projects, ref(local, "new")], false);
      store.getState().reconcile(groups(projects));
      expect(
        Object.values(store.getState().byEnvironment[local]!.visibility).every((value) => !value),
      ).toBe(true);
    } finally {
      store.setState(previous);
    }
  });

  it("remembers an empty machine snapshot before projects arrive from another client", () => {
    expect(reconcileProjectRailVisibility({}, groups(projects), [])).toEqual({});
    const empty = reconcileProjectRailVisibility({}, [], [local]);
    const discovered = reconcileProjectRailVisibility(empty, groups([ref(local, "later")]), [
      local,
    ]);
    expect(discovered[local]?.visibility).toEqual({ later: false });
  });

  it("does not publish a visibility update when every requested choice is unchanged", () => {
    const previous = useProjectRailStore.getState();
    using writes = vi.spyOn(useProjectRailStore.persist.getOptions().storage!, "setItem");
    try {
      useProjectRailStore.setState({ byEnvironment: {} });
      useProjectRailStore.getState().setVisible(projects, false);
      useProjectRailStore.getState().reconcile(groups(projects));
      const saved = useProjectRailStore.getState().byEnvironment;
      writes.mockClear();
      useProjectRailStore.getState().setVisible(projects, false);
      useProjectRailStore.getState().reconcile(groups(projects));
      expect(useProjectRailStore.getState().byEnvironment).toBe(saved);
      expect(writes).not.toHaveBeenCalled();
    } finally {
      useProjectRailStore.setState(previous);
    }
  });

  it("restores visibility safely from client storage without overwriting actions", () => {
    const merge = useProjectRailStore.persist.getOptions().merge!;
    const state = useProjectRailStore.getState();
    const restored = merge(
      {
        byEnvironment: {
          [local]: { initialized: true, visibility: { a: false, b: true, corrupt: "yes" } },
          [remote]: null,
        },
        setVisible: null,
      },
      state,
    );
    expect(restored.byEnvironment).toEqual({
      [local]: { initialized: true, visibility: { a: false, b: true } },
    });
    expect(restored.setVisible).toBe(state.setVisible);
    expect(
      reconcileProjectRailVisibility(restored.byEnvironment, groups(projects))[local]?.visibility,
    ).toEqual({ a: false, b: true, c: false, d: false });
  });
});
