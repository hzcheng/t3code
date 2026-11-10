import { LayoutGridIcon, PlusIcon } from "lucide-react";
import { memo } from "react";

import { cn } from "~/lib/utils";

import type { SidebarProjectSnapshot } from "../sidebarProjectGrouping";
import { ProjectFavicon } from "./ProjectFavicon";
import type {
  ProjectRailActivity,
  ProjectRailEntry,
  ProjectRailSelection,
} from "./ProjectRail.logic";

type RailEntry = ProjectRailEntry<SidebarProjectSnapshot>;
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

const ACTIVITY_DOT_CLASS: Record<Exclude<ProjectRailActivity, null>, string> = {
  attention: "bg-warning",
  working: "bg-info",
  done: "bg-success",
};

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
  readonly activityByProjectKey: ReadonlyMap<string, ProjectRailActivity>;
  readonly selectionByProjectKey: ReadonlyMap<string, ProjectRailSelection>;
  /** Scope is empty: the sidebar shows every project. */
  readonly allProjectsSelected: boolean;
  readonly onOpenAllProjects: () => void;
  readonly onOpenGroup: (entry: RailEntry, additive: boolean) => void;
  readonly onAddProject: () => void;
}

/**
 * The project rail: one icon per sidebar project, clustered by machine. Click
 * scopes the sidebar to that project and opens its latest thread; shift/⌘-click
 * toggles it in a multi-project scope. Mirrors the project scope combobox in
 * the sidebar header; both edit the same persisted scope.
 */
export const ProjectRail = memo(function ProjectRail(input: ProjectRailProps) {
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
                onClick={() => input.onOpenAllProjects()}
                className={cn(
                  "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
                  input.allProjectsSelected && "ring-2 ring-primary",
                )}
              >
                <LayoutGridIcon className="size-4" aria-hidden />
              </button>
            }
          />
          <TooltipPopup side="right">All projects</TooltipPopup>
        </Tooltip>

        {input.entries.map((entry) => {
          const activity = entry.offline
            ? null
            : (input.activityByProjectKey.get(entry.group.projectKey) ?? null);
          const selection = input.selectionByProjectKey.get(entry.group.projectKey) ?? null;
          return (
            <div key={entry.group.projectKey} className="flex w-full flex-col items-center">
              {entry.dividerBefore ? (
                <div className="mb-1 w-6 border-t border-sidebar-border" aria-hidden />
              ) : null}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={railTooltip(entry, activity)}
                      aria-pressed={selection !== null}
                      disabled={entry.offline}
                      onClick={(event) =>
                        input.onOpenGroup(entry, event.shiftKey || event.metaKey || event.ctrlKey)
                      }
                      className={cn(
                        "relative flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors hover:bg-sidebar-row-hover disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent",
                        selection === "single" && "ring-2 ring-primary",
                        selection === "multi" && "ring-2 ring-info",
                      )}
                    >
                      <ProjectFavicon project={entry.group} className="size-5" />
                      {activity ? (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-sidebar",
                            ACTIVITY_DOT_CLASS[activity],
                          )}
                        />
                      ) : null}
                    </button>
                  }
                />
                <TooltipPopup side="right">{railTooltip(entry, activity)}</TooltipPopup>
              </Tooltip>
            </div>
          );
        })}

        <div className="flex-1" aria-hidden />
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="Add project"
                onClick={() => input.onAddProject()}
                className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-dashed border-sidebar-border text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
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
