import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../test/render";
import {
  buildSidebarProjectSnapshots,
  type SidebarProjectSnapshot,
} from "../sidebarProjectGrouping";
import { ProjectRail } from "./ProjectRail";
import {
  buildProjectRailEntries,
  buildProjectRailSelection,
  type ProjectRailEntry,
} from "./ProjectRail.logic";

const localEnvironmentId = EnvironmentId.make("rail-env-local");
const remoteEnvironmentId = EnvironmentId.make("rail-env-remote");
const environmentLabelById = new Map([
  [localEnvironmentId, "This Mac"],
  [remoteEnvironmentId, "Build box"],
]);

function makeProject(environmentId: EnvironmentId, id: string, title: string) {
  return {
    environmentId,
    id: ProjectId.make(id),
    title,
    workspaceRoot: `/work/${id}`,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeEntries(input?: { onlineEnvironmentIds?: ReadonlySet<EnvironmentId> }) {
  const groups: SidebarProjectSnapshot[] = buildSidebarProjectSnapshots({
    projects: [
      makeProject(localEnvironmentId, "rail-project-local", "Local app"),
      makeProject(remoteEnvironmentId, "rail-project-remote", "Remote app"),
    ],
    settings: { sidebarProjectGroupingMode: "separate", sidebarProjectGroupingOverrides: {} },
    primaryEnvironmentId: localEnvironmentId,
    resolveEnvironmentLabel: (environmentId) => environmentLabelById.get(environmentId) ?? null,
  });
  return buildProjectRailEntries({
    groups,
    primaryEnvironmentId: localEnvironmentId,
    onlineEnvironmentIds:
      input?.onlineEnvironmentIds ?? new Set([localEnvironmentId, remoteEnvironmentId]),
    environmentLabelById,
  });
}

function clickWithModifiers(
  element: Element,
  modifiers: { shiftKey?: boolean; metaKey?: boolean },
) {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...modifiers }));
}

it("opens a project on click and toggles multi-select on shift-click", async () => {
  const entries = makeEntries();
  const onOpenGroup =
    vi.fn<(entry: ProjectRailEntry<SidebarProjectSnapshot>, additive: boolean) => void>();
  await using screen = await render(
    <ProjectRail
      entries={entries}
      activityByProjectKey={new Map()}
      selectionByProjectKey={new Map()}
      allProjectsSelected
      onOpenAllProjects={vi.fn()}
      onOpenGroup={onOpenGroup}
      onAddProject={vi.fn()}
    />,
  );

  const localButton = screen.getByRole("button", { name: /Local app/ });
  await userEvent.click(localButton);
  expect(onOpenGroup).toHaveBeenCalledTimes(1);
  expect(onOpenGroup.mock.calls[0]?.[0].group.displayName).toBe("Local app");
  expect(onOpenGroup.mock.calls[0]?.[1]).toBe(false);

  clickWithModifiers(await localButton.element(), { shiftKey: true });
  expect(onOpenGroup).toHaveBeenCalledTimes(2);
  expect(onOpenGroup.mock.calls[1]?.[1]).toBe(true);
});

it("disables icons whose machine is offline and keeps the all-projects entry", async () => {
  const entries = makeEntries({ onlineEnvironmentIds: new Set([localEnvironmentId]) });
  const onOpenGroup = vi.fn();
  const onOpenAllProjects = vi.fn();
  await using screen = await render(
    <ProjectRail
      entries={entries}
      activityByProjectKey={new Map()}
      selectionByProjectKey={buildProjectRailSelection({
        selectedProjectKeys: entries.map((entry) => entry.group.projectKey),
      })}
      allProjectsSelected={false}
      onOpenAllProjects={onOpenAllProjects}
      onOpenGroup={onOpenGroup}
      onAddProject={vi.fn()}
    />,
  );

  await expect.element(screen.getByRole("button", { name: /Remote app.*offline/ })).toBeDisabled();
  // Multi-selected projects show pressed; the all-projects entry exits multi-select.
  await expect(screen.getByRole("button", { name: "Local app · This Mac" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await userEvent.click(screen.getByRole("button", { name: "All projects" }));
  expect(onOpenAllProjects).toHaveBeenCalledTimes(1);
  expect(onOpenGroup).not.toHaveBeenCalled();
});
