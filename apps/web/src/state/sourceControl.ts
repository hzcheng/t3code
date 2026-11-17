import { createSourceControlEnvironmentAtoms } from "@t3tools/client-runtime/state/source-control";

import { connectionAtomRuntime } from "../connection/runtime";
import { useProjectRailStore } from "../projectRailStore";

const commands = createSourceControlEnvironmentAtoms(connectionAtomRuntime);

export const sourceControlEnvironment = {
  ...commands,
  startProjectClone: {
    ...commands.startProjectClone,
    run: async (...[registry, target]: Parameters<typeof commands.startProjectClone.run>) => {
      const result = await commands.startProjectClone.run(registry, target);
      if (result._tag === "Success" && result.value.projectId === target.input.projectId) {
        useProjectRailStore
          .getState()
          .setVisible(
            [{ environmentId: target.environmentId, projectId: result.value.projectId }],
            true,
          );
      }
      return result;
    },
  },
};
