# Fork releases

The `hzcheng/t3code` fork maintains its own `main`. Features, fixes, and upstream
syncs enter through pull requests. `Fork checks` must pass against an up-to-date
base; administrators are also subject to branch protection. Another reviewer's
approval is not required for this single-maintainer fork.

Inherited upstream workflows are disabled in this fork's GitHub Actions settings.
`Fork CI` and `Fork release` use GitHub-hosted runners instead of the
upstream private runner infrastructure. Check workflow settings after importing
new upstream workflows.

## Publish a macOS Apple Silicon build

After the release commit has merged into `main`:

```sh
git fetch origin main
git tag v0.1.10-hz.1 origin/main
git push origin v0.1.10-hz.1
```

Choose a new tag for each release; do not move an existing release tag. The format
is `v<major>.<minor>.<patch>-hz.<positive integer>`. The workflow rejects commits
that are not ancestors of `origin/main` and uses the tag version for the app.

The workflow builds macOS arm64 and matching Linux x64/arm64 service archives.
Each Linux archive must pass the CLI smoke check (bundled libraries, version,
service launcher, and HTTP readiness) before the macOS job can publish. The
GitHub prerelease includes the DMG, ZIP, blockmaps, update metadata, Linux archives,
and `SHA256SUMS`. Assets are uploaded to a draft before it becomes public.

The ZIP and metadata support the updater; the DMG is the manual installer. Both
the update feed and the SSH service download source point to this fork. The
workflow sets `T3CODE_RELEASE_BASE_URL` at build time so apps opened from Finder
also use it. A runtime value of that variable overrides the packaged default.
SSH installs the desktop version's service archive; every new tag must ship its
own archives rather than depending on a previous release's files.

These builds have no Developer ID signing or Apple notarization. macOS may require
manual approval to open them; reliable automatic update installation is not yet
validated. Download and install the DMG manually. A failed workflow can be rerun;
if it already created a release, inspect that release before retrying publication.
