@smoke @lightpanda
Feature: Browser automation through Lightpanda
  As a developer
  I want to execute readable Gherkin scenarios against Lightpanda
  So that browser behavior is verified with a fast headless runtime

  Scenario: Open the Playwright documentation
    Given I open "https://playwright.dev/"
    Then the page title contains "Playwright"
    And the page contains heading "Playwright enables reliable end-to-end testing"
