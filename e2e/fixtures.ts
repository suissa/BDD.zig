import { lightpanda } from "@lightpanda/browser";
import { chromium, type Page } from "playwright-core";
import { test as base } from "@playwright/test";

const host = process.env.LIGHTPANDA_HOST ?? "127.0.0.1";
const port = Number(process.env.LIGHTPANDA_PORT ?? "9222");
const endpointURL = `ws://${host}:${port}`;

type Fixtures = {
  lpdPage: Page;
};

export const test = base.extend<Fixtures>({
  lpdPage: async ({}, use) => {
    const process = await lightpanda.serve({ host, port });
    let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
    let context: Awaited<ReturnType<NonNullable<typeof browser>["newContext"]>> | undefined;

    try {
      browser = await chromium.connectOverCDP(endpointURL);
      context = await browser.newContext();
      const page = await context.newPage();
      await use(page);
      await page.close();
    } finally {
      if (context) await context.close().catch(() => undefined);
      if (browser) await browser.close().catch(() => undefined);
      process.stdout.destroy();
      process.stderr.destroy();
      process.kill();
    }
  },
});

export { expect } from "@playwright/test";
