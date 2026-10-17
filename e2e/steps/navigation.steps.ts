import { createBdd } from "playwright-bdd";
import { expect, test } from "../fixtures.js";

const { Given, When, Then } = createBdd(test);

Given("I open {string}", async ({ lpdPage }, url: string) => {
  await lpdPage.goto(url, { waitUntil: "domcontentloaded" });
});

When("I follow the link named {string}", async ({ lpdPage }, name: string) => {
  await lpdPage.getByRole("link", { name }).click();
});

Then("the page title contains {string}", async ({ lpdPage }, expected: string) => {
  await expect(lpdPage).toHaveTitle(new RegExp(expected, "i"));
});

Then("the page contains heading {string}", async ({ lpdPage }, heading: string) => {
  await expect(lpdPage.getByRole("heading", { name: heading })).toBeVisible();
});
