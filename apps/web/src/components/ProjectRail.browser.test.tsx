import "../index.css";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { useState } from "react";

import { render } from "../../test/render";
import {
  buildSidebarProjectSnapshots,
  type SidebarProjectSnapshot,
} from "../sidebarProjectGrouping";
import { ProjectRail as ProjectRailView } from "./ProjectRail";

function ProjectRail(
  props: Omit<Parameters<typeof ProjectRailView>[0], "visibleProjectKeys" | "onVisibilityChange">,
) {
  const [visible, setVisible] = useState(() => new Set(props.entries.map((entry) => entry.key)));
  return (
    <ProjectRailView
      {...props}
      visibleProjectKeys={visible}
      onVisibilityChange={(entries, shown) => {
        setVisible((previous) => {
          const next = new Set(previous);
          for (const entry of entries) {
            if (shown) next.add(entry.key);
            else next.delete(entry.key);
          }
          return next;
        });
      }}
    />
  );
}
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

function makeEntries(input?: {
  onlineEnvironmentIds?: ReadonlySet<EnvironmentId>;
  additionalProjects?: ReturnType<typeof makeProject>[];
}) {
  const groups: SidebarProjectSnapshot[] = buildSidebarProjectSnapshots({
    projects: [
      makeProject(localEnvironmentId, "rail-project-local", "Local app"),
      makeProject(remoteEnvironmentId, "rail-project-remote", "Remote app"),
      ...(input?.additionalProjects ?? []),
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
    sessionProjectRefs: [],
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
      onGroupContextMenu={vi.fn()}
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

it("renders the unseen-completion dot", async () => {
  const entries = makeEntries();
  await using screen = await render(
    <ProjectRail
      entries={entries}
      activityByProjectKey={new Map([[entries[0]!.key, "done"]])}
      selectionByProjectKey={new Map()}
      allProjectsSelected
      onOpenAllProjects={vi.fn()}
      onOpenGroup={vi.fn()}
      onGroupContextMenu={vi.fn()}
      onAddProject={vi.fn()}
    />,
  );
  const button = await screen.getByRole("button", { name: /Local app/ }).element();
  await expect.element(button.querySelector<HTMLElement>(".bg-success")).toBeInTheDocument();
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
        entries: entries.map((entry) => ({
          key: entry.key,
          environmentId: entry.environmentId,
          projectKey: entry.group.projectKey,
          isScratch: entry.group.isScratch,
        })),
      })}
      allProjectsSelected={false}
      onOpenAllProjects={onOpenAllProjects}
      onOpenGroup={onOpenGroup}
      onGroupContextMenu={vi.fn()}
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
  await userEvent.click(screen.getByRole("button", { name: "All projects on Build box" }));
  const visibility = screen.getByRole("checkbox", { name: "Show Remote app in project rail" });
  await expect.element(visibility).toBeEnabled();
  await userEvent.click(visibility);
  await expect.element(visibility).not.toBeChecked();
});

it("edits multiple visibility checkboxes without closing or changing thread scope", async () => {
  const entries = makeEntries({
    additionalProjects: [
      makeProject(localEnvironmentId, "tools", "Tools"),
      makeProject(localEnvironmentId, "docs", "Docs"),
    ],
  });
  const onOpenGroup = vi.fn();
  await using screen = await render(
    <ProjectRail
      entries={entries}
      activityByProjectKey={new Map()}
      selectionByProjectKey={buildProjectRailSelection({
        selectedProjectKeys: entries.map((entry) => entry.group.projectKey),
        entries: entries.map((entry) => ({
          key: entry.key,
          environmentId: entry.environmentId,
          projectKey: entry.group.projectKey,
          isScratch: entry.group.isScratch,
        })),
      })}
      allProjectsSelected={false}
      onOpenAllProjects={vi.fn()}
      onOpenGroup={onOpenGroup}
      onGroupContextMenu={vi.fn()}
      onAddProject={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "All projects on This Mac" }));
  const allProjects = screen.getByRole("checkbox", { name: "Show all projects on This Mac" });
  await expect.element(allProjects).toBeChecked();
  await userEvent.fill(
    screen.getByRole("textbox", { name: "Search projects on This Mac" }),
    "Tools",
  );
  await userEvent.click(allProjects);
  await expect
    .element(screen.getByRole("checkbox", { name: "Show Tools in project rail" }))
    .not.toBeChecked();
  await expect.element(allProjects).not.toBeChecked();
  await expect
    .element(screen.getByRole("button", { name: "Remote app · Build box", exact: true }))
    .toBeVisible();
  await userEvent.fill(screen.getByRole("textbox", { name: "Search projects on This Mac" }), "");
  await expect
    .element(screen.getByRole("checkbox", { name: "Show Local app in project rail" }))
    .not.toBeChecked();
  await expect
    .element(screen.getByRole("checkbox", { name: "Show Docs in project rail" }))
    .not.toBeChecked();
  await userEvent.fill(
    screen.getByRole("textbox", { name: "Search projects on This Mac" }),
    "Tools",
  );
  await userEvent.click(allProjects);
  await expect
    .element(screen.getByRole("checkbox", { name: "Show Tools in project rail" }))
    .toBeChecked();
  await expect.element(allProjects).toBeChecked();
  await userEvent.fill(screen.getByRole("textbox", { name: "Search projects on This Mac" }), "");
  await expect
    .element(screen.getByRole("checkbox", { name: "Show Local app in project rail" }))
    .toBeChecked();
  await expect
    .element(screen.getByRole("checkbox", { name: "Show Docs in project rail" }))
    .toBeChecked();
  await userEvent.click(screen.getByRole("checkbox", { name: "Show Local app in project rail" }));
  await expect.element(allProjects).toHaveAttribute("aria-checked", "mixed");
  await userEvent.click(allProjects);
  await expect.element(allProjects).toBeChecked();
  await expect
    .element(screen.getByRole("checkbox", { name: "Show Local app in project rail" }))
    .toBeChecked();
  await userEvent.click(screen.getByRole("checkbox", { name: "Show Local app in project rail" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Show Tools in project rail" }));
  await expect
    .element(screen.getByRole("checkbox", { name: "Show Local app in project rail" }))
    .not.toBeChecked();
  await expect
    .element(screen.getByRole("checkbox", { name: "Show Tools in project rail" }))
    .not.toBeChecked();
  await expect
    .element(screen.getByRole("button", { name: "Local app · This Mac", exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "All projects on This Mac" }))
    .toHaveAttribute("aria-pressed", "true");
  await userEvent.fill(
    screen.getByRole("textbox", { name: "Search projects on This Mac" }),
    "Tools",
  );
  await userEvent.click(screen.getByRole("checkbox", { name: "Show Tools in project rail" }));
  await userEvent.fill(screen.getByRole("textbox", { name: "Search projects on This Mac" }), "");
  await expect
    .element(screen.getByRole("checkbox", { name: "Show Local app in project rail" }))
    .not.toBeChecked();
  await expect
    .element(screen.getByRole("checkbox", { name: "Show Tools in project rail" }))
    .toBeChecked();
  await userEvent.click(screen.getByRole("checkbox", { name: "Show Tools in project rail" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Show Docs in project rail" }));
  await userEvent.click(screen.getByRole("button", { name: "Close project list", exact: true }));
  await expect
    .element(screen.getByRole("button", { name: "All projects on This Mac" }))
    .toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "All projects on This Mac" }));
  await expect
    .element(screen.getByRole("checkbox", { name: "Show Local app in project rail" }))
    .not.toBeChecked();
  await expect
    .element(screen.getByRole("checkbox", { name: "Show Remote app in project rail" }))
    .not.toBeInTheDocument();
  await userEvent.click(screen.getByText("Local app", { exact: true }));
  await userEvent.click(screen.getByText("Tools", { exact: true }));
  await expect
    .element(screen.getByRole("checkbox", { name: "Show Local app in project rail" }))
    .toBeChecked();
  await expect
    .element(screen.getByRole("checkbox", { name: "Show Tools in project rail" }))
    .toBeChecked();
  await userEvent.keyboard("{Escape}");
  await userEvent.click(screen.getByRole("button", { name: "All projects on This Mac" }));
  await expect
    .element(screen.getByRole("checkbox", { name: "Show Local app in project rail" }))
    .toBeChecked();
  await expect
    .element(screen.getByRole("checkbox", { name: "Show Tools in project rail" }))
    .toBeChecked();
  expect(onOpenGroup).not.toHaveBeenCalled();
});

it("opens the project context menu on right-click", async () => {
  const entries = makeEntries();
  const onGroupContextMenu = vi.fn();
  await using screen = await render(
    <ProjectRail
      entries={entries}
      activityByProjectKey={new Map()}
      selectionByProjectKey={new Map()}
      allProjectsSelected
      onOpenAllProjects={vi.fn()}
      onOpenGroup={vi.fn()}
      onGroupContextMenu={onGroupContextMenu}
      onAddProject={vi.fn()}
    />,
  );

  const button = await screen.getByRole("button", { name: /Remote app/ }).element();
  button.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 120 }),
  );
  expect(onGroupContextMenu).toHaveBeenCalledTimes(1);
  expect(onGroupContextMenu.mock.calls[0]?.[0].group.displayName).toBe("Remote app");
  expect(onGroupContextMenu.mock.calls[0]?.[1]).toEqual({ x: 40, y: 120 });
});
