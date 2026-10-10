import { test, expect } from "@playwright/test";
test("patient review, filters, upload, sharing revocation and emergency QR", async ({
  page,
  context,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/records");
  await expect(page).toHaveURL(/login/);
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Your health, in perspective." }),
  ).toBeVisible();
  await page.screenshot({
    path: "../artifacts/medibridge-dashboard.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Medical records", exact: true })
    .click();
  await page.getByLabel("Search records").fill("Complete blood");
  await expect(
    page.getByRole("link", { name: /Complete blood count/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Consultation review/ }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: /Complete blood count/ }).click();
  await page.getByLabel(/I checked these details/).check();
  await page.getByRole("button", { name: "Confirm & update timeline" }).click();
  await expect(page.getByRole("status")).toContainText("Review saved");
  await page
    .getByRole("link", { name: "Health timeline", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: /Complete blood count/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Doctor access", exact: true }).click();
  await page.getByLabel("Share label").fill("Test doctor");
  await page.getByRole("checkbox", { name: /Complete blood count/ }).check();
  await page.getByRole("button", { name: "Generate read-only link" }).click();
  const doctorURL = await page.getByLabel("Generated access link").inputValue();
  const doctor = await context.newPage();
  await doctor.goto(doctorURL);
  await expect(
    doctor.getByRole("heading", { name: "Test doctor", exact: true }),
  ).toBeVisible();
  await expect(
    doctor.getByRole("button", { name: "View", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Revoke access", exact: true })
    .click();
  await doctor.reload();
  await expect(doctor.getByRole("alert")).toContainText("revoked");
  await page.getByRole("link", { name: "Emergency card", exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Fictional Alex");
  await page.getByLabel("Share display name", { exact: true }).check();
  await page.getByLabel("Allergies", { exact: true }).fill("Penicillin");
  await page.getByLabel("Share allergies", { exact: true }).check();
  await page.getByRole("button", { name: "Generate QR", exact: true }).click();
  await expect(page.locator(".qr svg")).toBeVisible();
  const emergencyURL = await page
    .getByLabel("Generated access link")
    .inputValue();
  await doctor.goto(emergencyURL);
  await expect(doctor.locator(".emergency-summary")).toContainText(
    "Fictional Alex",
  );
  await expect(doctor.locator(".emergency-summary")).toContainText(
    "Penicillin",
  );
  await expect(doctor.locator(".emergency-summary")).not.toContainText(
    "contact phone",
  );
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await doctor.reload();
  await expect(doctor.getByRole("alert")).toContainText("revoked");
  await page.getByRole("link", { name: "Add record", exact: true }).click();
  await page
    .getByLabel("Upload medical document")
    .setInputFiles({
      name: "bad.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("not a PDF"),
    });
  await expect(page.getByRole("alert")).toContainText(
    /damaged|signature|supported/,
  );
  const sample = await request.get("/api/demo/samples/prescription");
  await page
    .getByLabel("Upload medical document")
    .setInputFiles({
      name: "prescription.pdf",
      mimeType: "application/pdf",
      buffer: await sample.body(),
    });
  await expect(
    page.getByRole("heading", { name: "Review extracted details" }),
  ).toBeVisible();
  for (const nav of [
    "Medications",
    "Allergies",
    "Review & safety",
    "Access history",
  ]) {
    await page.getByRole("link", { name: nav, exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Your health, in perspective." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "../artifacts/medibridge-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("API errors are visible and never replaced by fake records", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Your health, in perspective." }),
  ).toBeVisible();
  await page.route("**/api/records", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Test outage: service unavailable" }),
    }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Test outage");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Test outage");
});
