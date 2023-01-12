# General Maintenance Tasks

Things to keep in mind or do in the course of general maintenance.


## Dependency Updates/Dependabot

We currently use [Dependabot][] to keep our dependencies up to date. It’ll automatically create pull requests once a week for dependencies that are out of date. Usually, handling these is straightforward: as long as the tests and other checks pass, review the changelog for the dependency (usually Dependabot will include it in the PR description) and make sure nothing else should change (deprecated features we might be using, etc.).

- If things are all clear, go ahead and merge.
- If not, either…
    - Add more commits to the PR with other things that need to be fixed to keep using the dependency correctly and then merge. If you do this, note any major changes you made as a comment in the PR.
    - If there’s a regresssion or bug in the dependency that isn’t worth or can’t be worked around reject the PR by adding a comment describing the reason (if there’s a bug in the dependency’s bug tracker, link it!) and close the PR (or include `@dependabot close` in your comment) to tell Dependabot to ignore that specific release.

        If the reason for not updating the dependency is more complex and won’t be fixed in the current major or minor release, you can also use the `@dependabot ignore this <type> version` command to tell Dependabot to close the PR and not create new ones for certain types of releases.


However, **some dependencies are designed to be updated _together_, and shouldn’t be merged as independent PRs.** Often the individual PRs won’t pass tests in this case, but sometimes they still do (tests might not cover something, or that particular set of releases just happens to work together, but not by design). In these cases, you’ll need to add another commit to the PR that updates the related dependencies by tweaking the relevant `package.json` files and running `npm install` to update the lockfile. For an example, see [PR #1233][issue-1233].

After you merge a PR that you’ve updated to include multiple dependencies, Dependabot will automatically close any existing independent PRs for the other dependencies you added.

As of January 2023, dependencies that should be grouped include:
- `@aws-sdk/*`
- `@sentry/*`
- `@typescript-eslint/*`
- `@babel/*` (not usually required to be grouped, but sometimes is).
- `ts-jest` usually needs updating when `jest` has a major release and sometimes for minor releases (but not patch releases). Check out the [ts-jest docs][ts-jest-docs] for details on how to choose the correct version to work with `jest`.

Dependabot does this automatically when `xyz` and `@types/<xyz>` both have updates. There are several open issues tracking versions of this issue for other types of grouped dependencies, which you can subscribe to if you want:
- https://github.com/dependabot/dependabot-core/issues/1296
- https://github.com/dependabot/dependabot-core/issues/6008


### The `@types/node` Package

The `@types/node` package is a little bit special in that its major versions are designed to match up with the Node.js major version in use. For example, if a project is using Node.js 18, it should use `@types/node@18.x`. The minor and patch releases do not stay in sync with Node.js, though.

Dependabot will suggest PRs to update this package to new major versions that don’t match the Node.js version the project is set to. Tell Dependabot to ignore that major release by posting a PR comment like `@depenabot ignore this major version`.

Make sure to update this dependency when you upgrade Node.js to a new major version (see below on Node.js updates).


## Updating Node.js

### Only use LTS Versions

Node.js has a somewhat unusual versioning system (based on Ubuntu Linux): Odd-numbered major versions (15.x, 17.x, 19.x, etc.) are *never* stable, and are primarily intended for testing upcoming low-level features and binary API changes. They should never be used in production. Even-numbered major versions are “Current” (new, stable-ish) and later “Active LTS (Long-Term Support)” (stable, but still receiving new features and updates), “Maintenance” (only critical updates and security patches), or simply unsupported once they are too old.

We generally aim to stay on the Active LTS version. You can see the official release schedule at: https://github.com/nodejs/release#release-schedule)


### Dependabot & Node.js

Dependabot will generally create a PR that updates the `Dockerfile` when there are new Node.js releases. However, it will miss several files and places that also need updates — **never merge these Dependabot PRs as-is**.

The best way to find other places that need updating is usually to search the codebase for the `<major>.<minor>` release being upgraded *from* (e.g. `18.12`), since some spots don’t list the patch version.

You should also make sure to update the `@types/node` JS dependency to the appropriate major version in every `package.json` file it is listed in (see above section on this package).

For an example Node.js update, see [PR #1121][issue-1121].


[dependabot]: https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/about-dependabot-version-updates
[ts-jest-docs]: https://www.npmjs.com/package/ts-jest
[issue-1121]: https://github.com/usdigitalresponse/univaf/pull/1221
[issue-1233]: https://github.com/usdigitalresponse/univaf/pull/1233
