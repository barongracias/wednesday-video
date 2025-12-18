import { test, expect } from "@playwright/test";

test("loads home and demo controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Wednesday's")).toBeVisible();
  await page.getByRole("button", { name: "Load demo circle" }).click();
  await expect(page.getByText("Demo data loaded")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause queue" })).toBeVisible();
});

test("record fallback: choose file and see upload status", async ({ page }) => {
  await page.goto("/");
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Use existing video" }).click();
  const chooser = await fileChooserPromise;
  // attach a tiny fake file
  await chooser.setFiles({
    name: "sample.webm",
    mimeType: "video/webm",
    buffer: Buffer.from("dummy"),
  });
  await expect(page.getByText("Loaded local file")).toBeVisible();
  await expect(page.getByText("queued", { exact: false })).toBeVisible();
});

test("report content button logs a flag", async ({ page }) => {
  await page.goto("/");
  page.on("dialog", (dialog) => dialog.accept("Inappropriate"));
  await page.getByRole("button", { name: "Report content" }).click();
  await expect(page.getByText("Flag saved locally", { exact: false })).toBeVisible();
});

test("queue controls exist and clear completed", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Clear completed" })).toBeVisible();
});

test("theme toggle switches to light", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Theme" }).click();
  const hasLight = await page.evaluate(() =>
    document.documentElement.classList.contains("light")
  );
  expect(hasLight).toBeTruthy();
});

test("fetch buttons are visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Fetch uploads" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fetch flags" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send invite" })).toBeVisible();
});

test("invite/fetch status surfaces defaults", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("No fetches yet")).toBeVisible();
  await expect(page.getByText("No invites yet.")).toBeVisible();
});
