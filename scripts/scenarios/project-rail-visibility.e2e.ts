import { expect } from "e2e";

import { T3_HOME } from "../e2e.config.ts";
import { test, WEB } from "./t3.ts";

test(
  "Project rail initializes logical entries and preserves explicit visibility",
  WEB,
  async ({ t3, app, screen, browser }) => {
    const repository = {
      ".git/config": '[remote "origin"]\n  url = https://github.com/scenario/aaa-rail-shared.git\n',
    };
    await t3.project("shared-1", repository);
    for (const title of ["rail-b", "rail-c", "rail-d"]) await t3.project(title);
    await t3.project("shared-2", repository);
    await t3.project("shared-3", repository);
    await t3.open();

    const rail = screen.getByRole("navigation", "Projects");
    const more = rail.getByRole("button", /^All projects on /);
    await expect(more).toBeVisible();
    await app.screenshot("machine-entry-closed");
    await more.tap();
    await expect(screen.getByText("3 / 4", { exact: true })).toBeVisible();
    await app.screenshot("three-logical-projects");
    await screen.getByRole("button", "Close project list").tap();

    await t3.project("discovered-elsewhere");
    await more.tap();
    const discovered = screen.getByRole("checkbox", "Show discovered-elsewhere in project rail");
    await expect(discovered).toBeChecked({ checked: false });
    const master = screen.getByRole("checkbox", /^Show all projects on /);
    await master.tap();
    await expect(master).toBeChecked();
    await screen.getByRole("textbox", /^Search projects on /).fill("discovered");
    await discovered.uncheck();
    await expect(master).toHaveAttribute("aria-checked", "mixed");
    await master.tap();
    await expect(screen.getByText("5 / 5", { exact: true })).toBeVisible();
    await master.tap();
    await screen.getByRole("button", "Close project list").tap();
    await browser.reload();
    await more.tap();
    await expect(master).toBeChecked({ checked: false });
    await expect(screen.getByText("0 / 5", { exact: true })).toBeVisible();
    await screen.getByRole("button", "Close project list").tap();
    await expect(screen.getByRole("textbox", /^Search projects on /)).toBeHidden();
    await app.screenshot("machine-entry-all-hidden");

    await rail.getByRole("button", "Add project").tap();
    await screen.getByText("Local folder", { exact: true }).tap();
    await screen.getByRole("combobox").fill(`${T3_HOME}/workspaces/client-added`);
    await screen.getByRole("button", /^Create & Add /).tap();
    const added = rail.getByRole("button", /^client-added/);
    await expect(added).toBeVisible();
    await app.screenshot("client-added-project-visible");
    await more.tap();
    await expect(screen.getByText("1 / 6", { exact: true })).toBeVisible();
    await master.tap();
    await screen.getByRole("button", "Close project list").tap();
    const modifier = await browser.evaluate(() =>
      navigator.platform.includes("Mac") ? "Meta" : "Control",
    );
    await browser.keyboard.press(`${modifier}+Alt+]`);
    await expect(added).toHaveAttribute("aria-pressed", "false");
    await app.screenshot("keyboard-next-visible-project");
  },
);
