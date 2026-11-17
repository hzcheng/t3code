import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

import { useProjectRailStore } from "../projectRailStore";

const clone = vi.hoisted(() => ({
  run: vi.fn(),
}));
vi.mock("../connection/runtime", () => ({ connectionAtomRuntime: {} }));
vi.mock("@t3tools/client-runtime/state/source-control", () => ({
  createSourceControlEnvironmentAtoms: () => ({
    startProjectClone: { label: "clone", run: clone.run },
  }),
}));

import { sourceControlEnvironment } from "./sourceControl";

it("shows client-initiated clones without overriding reused projects or failed clones", async () => {
  const environmentId = EnvironmentId.make("clone-machine");
  const existingId = ProjectId.make("existing");
  const newId = ProjectId.make("new");
  const previous = useProjectRailStore.getState();
  const registry = AtomRegistry.make();
  try {
    useProjectRailStore.setState({
      byEnvironment: {
        [environmentId]: { initialized: true, visibility: { existing: false, new: false } },
      },
    });
    const target = {
      environmentId,
      input: {
        projectId: newId,
        title: "repo",
        remoteUrl: "https://github.com/test/repo.git",
        destinationPath: "/work/repo",
        createdAt: "2026-01-01T00:00:00Z",
      },
    };
    clone.run.mockResolvedValueOnce(
      AsyncResult.success({ projectId: existingId, cwd: "/work/repo" }),
    );
    await sourceControlEnvironment.startProjectClone.run(registry, target);
    expect(useProjectRailStore.getState().byEnvironment[environmentId]?.visibility.existing).toBe(
      false,
    );

    clone.run.mockResolvedValueOnce(AsyncResult.failure(Cause.die("clone failed")));
    await sourceControlEnvironment.startProjectClone.run(registry, target);
    expect(useProjectRailStore.getState().byEnvironment[environmentId]?.visibility.new).toBe(false);

    clone.run.mockResolvedValueOnce(AsyncResult.success({ projectId: newId, cwd: "/work/repo" }));
    await sourceControlEnvironment.startProjectClone.run(registry, target);
    expect(useProjectRailStore.getState().byEnvironment[environmentId]?.visibility.new).toBe(true);
  } finally {
    registry.dispose();
    clone.run.mockReset();
    useProjectRailStore.setState(previous);
  }
});
