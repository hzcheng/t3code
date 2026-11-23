import { expect } from "e2e";

import { SECOND_HOME, startSecondServer } from "./second-server.ts";
import { makeState, runPromise, test, WEB } from "./t3.ts";

test(
  "Selecting a shared repository in the rail selects only its machine",
  WEB,
  async ({ t3, app, screen }) => {
    const workspace = await t3.project("reddb", {
      ".git/config": '[remote "origin"]\n  url = https://github.com/scenario/reddb.git\n',
    });
    const server = startSecondServer(app.baseUrl ?? "");
    try {
      const { host, token } = await server.ready;
      await runPromise(
        makeState(SECOND_HOME).cli(["project", "add", workspace, "--title", "reddb"]),
      );
      await t3.open("/settings/connections");
      await screen.getByRole("button", "Add environment").tap();
      const dialog = screen.getByRole("dialog");
      await dialog.getByPlaceholder("backend.example.com").fill(host);
      await dialog.getByPlaceholder("PAIRCODE").fill(token);
      await dialog.getByRole("button", "Add environment").tap();
      await expect(screen.getByRole("button", /^More actions for (?!this machine$)/)).toBeVisible();
      await app.open("/");
      const icons = screen.getByRole("navigation", "Projects").getByRole("button", /reddb/);
      await expect(icons).toHaveCount(2);
      await icons.first().tap();
      await expect(icons.first()).toHaveAttribute("aria-pressed", "true");
      await app.screenshot("local-project-selected");
      await expect(icons.nth(1)).toHaveAttribute("aria-pressed", "false");
    } finally {
      await server.stop();
    }
  },
);
