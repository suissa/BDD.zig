# Lightpanda + Playwright BDD

This is an additive browser-testing adapter for BDD.zig. The existing Zig/Gherkin
compiler remains the native runner for Zig contexts; this adapter runs browser
scenarios written in Gherkin through `playwright-bdd`, Playwright's test runner,
and Lightpanda's Chrome DevTools Protocol (CDP) endpoint.

## Architecture

```text
e2e/features/**/*.feature
          |
          v
    playwright-bdd
  generate Playwright tests
          |
          v
  step definitions (TypeScript)
          |
          v
  custom lpdPage fixture
          |
          v
 Lightpanda CDP <-> Playwright
```

## Requirements

- Node.js 20 or newer.
- npm.
- Network access for the smoke test URL.
- Lightpanda package/runtime supported by the host platform.

## Run

```sh
npm install
npm run bdd:check
npm run bdd
```

The first command installs the adapter dependencies. `bdd:gen` generates tests
under `.features-gen/`; `bdd:test` runs them and writes the HTML report to
`playwright-report/` (test artifacts are stored under `test-results/`).

The fixture starts a local Lightpanda CDP process for each scenario and cleans it
up after the scenario. Workers are deliberately set to one because the default
fixture endpoint is `127.0.0.1:9222`. Set `LIGHTPANDA_HOST` and
`LIGHTPANDA_PORT` to change the endpoint. Do not increase workers while using
a single fixed port; a future worker-scoped fixture should allocate a unique
port per worker.

## Writing scenarios

Create `.feature` files in `e2e/features/` and add step definitions under
`e2e/steps/`. Browser steps receive the custom `lpdPage` fixture rather than
Playwright's default browser fixture, so scenarios actually run against
Lightpanda.

Prefer accessible locators such as `getByRole` and assertions that wait for the
expected state. Lightpanda is controlled over CDP; it is not a full visual
Chromium replacement. Validate the APIs and page features used by your app
against Lightpanda's current compatibility before moving all E2E tests to it.

## Scope

- The existing Zig test runner is unchanged.
- This adapter currently covers browser E2E scenarios only.
- The first smoke scenario is an external connectivity check, not a substitute
  for application-specific acceptance tests.
- No lockfile is committed yet, so use `npm install` for this initial integration.
  Commit the generated `package-lock.json` before switching CI to `npm ci`. The
  integration is in the repository, but its tests have not yet been run in a
  local Node/Lightpanda environment.
