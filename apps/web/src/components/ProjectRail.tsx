import type { EnvironmentId, EnvironmentMachineKind } from "@t3tools/contracts";
import { LayoutGridIcon, PlusIcon, XIcon } from "lucide-react";
import { memo, useState } from "react";

import { cn } from "~/lib/utils";

import type { SidebarProjectSnapshot } from "../sidebarProjectGrouping";
import { ProjectFavicon } from "./ProjectFavicon";
import { EnvironmentMachineIcon } from "./EnvironmentMachineIcon";
import type {
  ProjectRailActivity,
  ProjectRailEntry,
  ProjectRailSelection,
} from "./ProjectRail.logic";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Popover, PopoverClose, PopoverPopup, PopoverTitle, PopoverTrigger } from "./ui/popover";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

type RailEntry = ProjectRailEntry<SidebarProjectSnapshot>;

const ACTIVITY_DOT_CLASS: Record<Exclude<ProjectRailActivity, null>, string> = {
  attention: "bg-warning",
  working: "bg-info",
  done: "bg-success",
};
const PROJECT_VISIBILITY_ROW_CLASS =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-accent";

const ACTIVITY_TOOLTIP: Record<Exclude<ProjectRailActivity, null>, string> = {
  attention: "Waiting on you",
  working: "Working",
  done: "Finished, not yet viewed",
};

function railTooltip(entry: RailEntry, activity: ProjectRailActivity): string {
  const parts = [entry.group.displayName];
  if (entry.environmentLabel) parts.push(entry.environmentLabel);
  if (entry.offline) parts.push("offline");
  else if (activity) parts.push(ACTIVITY_TOOLTIP[activity].toLowerCase());
  return parts.join(" · ");
}

interface ProjectRailProps {
  readonly entries: readonly RailEntry[];
  readonly machineByEnvironmentId?: ReadonlyMap<EnvironmentId, EnvironmentMachineKind>;
  readonly visibleProjectKeys: ReadonlySet<string>;
  readonly activityByProjectKey: ReadonlyMap<string, ProjectRailActivity>;
  readonly selectionByProjectKey: ReadonlyMap<string, ProjectRailSelection>;
  readonly allProjectsSelected: boolean;
  readonly onOpenAllProjects: () => void;
  readonly onOpenGroup: (entry: RailEntry, additive: boolean) => void;
  readonly onGroupContextMenu: (entry: RailEntry, position: { x: number; y: number }) => void;
  readonly onVisibilityChange: (entries: readonly RailEntry[], visible: boolean) => void;
  readonly onAddProject: () => void;
}

function ActivityDot({ activity }: { activity: ProjectRailActivity }) {
  return activity ? (
    <span
      aria-label={ACTIVITY_TOOLTIP[activity]}
      role="img"
      className={cn(
        "block size-2.5 shrink-0 rounded-full border-2 border-sidebar",
        ACTIVITY_DOT_CLASS[activity],
      )}
    />
  ) : null;
}

function ProjectRailMachine({ entries, ...input }: ProjectRailProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const firstEntry = entries[0]!;
  const environmentLabel = firstEntry.environmentLabel ?? "Machine";
  const machineKind = input.machineByEnvironmentId?.get(firstEntry.environmentId) ?? "desktop";
  const offline = firstEntry.offline;
  const hidden = entries.filter((entry) => !input.visibleProjectKeys.has(entry.key));
  const allProjectsVisible = hidden.length === 0;
  const someProjectsVisible = hidden.length > 0 && hidden.length < entries.length;
  const hiddenSelected = hidden.filter((entry) => input.selectionByProjectKey.has(entry.key));
  const hiddenAttention = hidden.some(
    (entry) => !entry.offline && input.activityByProjectKey.get(entry.key) === "attention",
  );
  const moreLabel = `All projects on ${environmentLabel}`;
  const machineTooltip = `${environmentLabel} · Show/hide projects${offline ? " · offline" : ""}`;
  const filtered = entries.filter((entry) =>
    `${entry.group.displayName} ${entry.group.workspaceRoot}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  return (
    <div
      role="group"
      aria-label={environmentLabel}
      className="flex w-full shrink-0 flex-col items-center gap-1"
    >
      {entries[0]?.dividerBefore ? (
        <div className="my-1 w-6 border-t border-sidebar-border" aria-hidden />
      ) : null}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    aria-label={moreLabel}
                    aria-pressed={hiddenSelected.length > 0}
                    className="group relative flex h-8 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span
                      className={cn(
                        "flex h-6 w-8 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-row-hover text-sidebar-muted-foreground group-hover:border-sidebar-muted-foreground/60 group-hover:text-sidebar-foreground",
                        open && "border-sidebar-muted-foreground/60 text-sidebar-foreground",
                        offline && "border-dashed opacity-50",
                      )}
                    >
                      <EnvironmentMachineIcon kind={machineKind} className="size-4" aria-hidden />
                    </span>
                    {hiddenSelected.length > 0 ? (
                      <span
                        className="absolute bottom-0 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded-full bg-info"
                        aria-hidden
                      />
                    ) : null}
                    {hiddenAttention ? (
                      <span className="absolute -right-0.5 -bottom-0.5">
                        <ActivityDot activity="attention" />
                      </span>
                    ) : null}
                  </button>
                }
              />
            }
          />
          <TooltipPopup side="right">
            {machineTooltip}
            {hidden.length ? ` · ${hidden.length} hidden` : ""}
            {hiddenSelected.length ? ` · ${hiddenSelected.length} selected` : ""}
          </TooltipPopup>
        </Tooltip>
        <PopoverPopup
          side="right"
          align="start"
          width="md"
          padding="compact"
          aria-label={moreLabel}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 space-y-1.5">
                <PopoverTitle>Show in project rail</PopoverTitle>
                <p className="truncate text-xs text-muted-foreground">
                  {environmentLabel}
                  {offline ? " · Offline" : ""}
                </p>
              </div>
              <PopoverClose
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Close project list"
                    title="Close"
                  />
                }
              >
                <XIcon aria-hidden />
              </PopoverClose>
            </div>
            <Input
              aria-label={`Search projects on ${environmentLabel}`}
              placeholder="Search projects…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div
              className="max-h-80 overflow-y-auto"
              role="group"
              aria-label="Show in project rail"
            >
              <div className="sticky top-0 z-10 border-b border-border bg-popover pb-1">
                <label className={PROJECT_VISIBILITY_ROW_CLASS}>
                  <span className="min-w-0 flex-1 text-sm">All projects</span>
                  <Checkbox
                    aria-label={`Show all projects on ${environmentLabel}`}
                    title={`${allProjectsVisible ? "Hide" : "Show"} every project on this machine, regardless of the search`}
                    checked={allProjectsVisible}
                    indeterminate={someProjectsVisible}
                    onCheckedChange={() => input.onVisibilityChange(entries, !allProjectsVisible)}
                  />
                </label>
              </div>
              {filtered.map((entry) => {
                const content = (
                  <>
                    <ProjectFavicon project={entry.group} className="size-5 shrink-0" />
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm">{entry.group.displayName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {entry.group.workspaceRoot}
                        {entry.offline ? " · offline" : ""}
                      </span>
                    </span>
                  </>
                );
                return (
                  <label key={entry.group.projectKey} className={PROJECT_VISIBILITY_ROW_CLASS}>
                    {content}
                    <Checkbox
                      aria-label={`Show ${entry.group.displayName} in project rail`}
                      checked={input.visibleProjectKeys.has(entry.key)}
                      onCheckedChange={(checked) => input.onVisibilityChange([entry], checked)}
                    />
                  </label>
                );
              })}
              {filtered.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                  No matching projects
                </p>
              ) : null}
            </div>
            <div className="border-t border-border pt-2 text-xs text-muted-foreground">
              <span
                aria-label={`${entries.length - hidden.length} of ${entries.length} projects shown`}
              >
                {entries.length - hidden.length} / {entries.length}
              </span>
            </div>
          </div>
        </PopoverPopup>
      </Popover>
      {entries
        .filter((entry) => input.visibleProjectKeys.has(entry.key))
        .map((entry) => {
          const activity = entry.offline
            ? null
            : (input.activityByProjectKey.get(entry.key) ?? null);
          const selection = input.selectionByProjectKey.get(entry.key);
          return (
            <Tooltip key={entry.group.projectKey}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={railTooltip(entry, activity)}
                    aria-pressed={selection !== undefined}
                    disabled={entry.offline}
                    onClick={(event) =>
                      input.onOpenGroup(entry, event.shiftKey || event.metaKey || event.ctrlKey)
                    }
                    onContextMenu={(event) => {
                      event.preventDefault();
                      input.onGroupContextMenu(entry, { x: event.clientX, y: event.clientY });
                    }}
                    className={cn(
                      "relative flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors hover:bg-sidebar-row-hover focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent",
                      selection === "single" && "ring-2 ring-primary",
                      selection === "multi" && "ring-2 ring-info",
                    )}
                  >
                    <ProjectFavicon project={entry.group} className="size-5" />
                    <span className="absolute -right-0.5 -bottom-0.5">
                      <ActivityDot activity={activity} />
                    </span>
                  </button>
                }
              />
              <TooltipPopup side="right">{railTooltip(entry, activity)}</TooltipPopup>
            </Tooltip>
          );
        })}
    </div>
  );
}

export const ProjectRail = memo(function ProjectRail(input: ProjectRailProps) {
  const machines = new Map<string, RailEntry[]>();
  for (const entry of input.entries) {
    const entries = machines.get(entry.environmentId) ?? [];
    entries.push(entry);
    machines.set(entry.environmentId, entries);
  }
  return (
    <TooltipProvider>
      <nav
        aria-label="Projects"
        data-slot="project-rail"
        className="flex w-[52px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-sidebar-border py-2 [scrollbar-width:none]"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="All projects"
                aria-pressed={input.allProjectsSelected}
                onClick={input.onOpenAllProjects}
                className={cn(
                  "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-ring",
                  input.allProjectsSelected && "ring-2 ring-primary",
                )}
              >
                <LayoutGridIcon className="size-4" aria-hidden />
              </button>
            }
          />
          <TooltipPopup side="right">All projects</TooltipPopup>
        </Tooltip>
        {[...machines].map(([id, entries]) => (
          <ProjectRailMachine key={id} {...input} entries={entries} />
        ))}
        <div className="flex-1" aria-hidden />
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="Add project"
                onClick={input.onAddProject}
                className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-dashed border-sidebar-border text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <PlusIcon className="size-4" aria-hidden />
              </button>
            }
          />
          <TooltipPopup side="right">Add project</TooltipPopup>
        </Tooltip>
      </nav>
    </TooltipProvider>
  );
});
