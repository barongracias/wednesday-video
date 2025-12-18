// Basic Playwright config; set BASE_URL to your served app (e.g., http://localhost:8000)
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:8000",
    headless: true,
  },
  reporter: [["list"]],
});
