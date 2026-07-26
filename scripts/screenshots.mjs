/**
 * Regenerates the README screenshot tour against a running ShipKit instance.
 *
 *   node scripts/screenshots.mjs [baseUrl]
 *
 * Requires Google Chrome installed. Uses the first Expo-ready project found
 * for the chat/setup shots, and creates (then deletes) a throwaway project to
 * capture the import-diagnosis screen.
 */
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs", "screenshots");
const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
];

const chrome = CHROME_PATHS.find((p) => fs.existsSync(p));
if (!chrome) {
  console.error("Chrome not found — install Google Chrome or add its path to CHROME_PATHS.");
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const api = async (route, init) => {
  const res = await fetch(`${BASE}${route}`, init);
  return res.json();
};

const browser = await puppeteer.launch({ executablePath: chrome, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 840, deviceScaleFactor: 2 });

async function shot(name, url, { waitText, timeout = 20000, before } = {}) {
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle2", timeout: 30000 });
  if (waitText) {
    await page.waitForFunction(
      (t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
      { timeout },
      waitText
    );
  }
  if (before) await before();
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`✓ ${name}.png`);
}

// Pick a converted project for the chat/setup shots.
const projects = await api("/api/projects");
const expoProject = projects.find((p) => p.kind === "expo" && p.name !== "Demo Expo App") ?? projects.find((p) => p.kind === "expo");
if (!expoProject) {
  console.error("No Expo-ready project found — convert one first.");
  process.exit(1);
}

// 1. Welcome — connect your coding agent
await shot("1-welcome", "/welcome", { waitText: "Claude Code" });

// 2. Dashboard
await shot("2-dashboard", "/", { waitText: "Your projects" });

// 3. Import diagnosis — throwaway project with an unreachable repo
const temp = await api("/api/projects", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "My Private App", repoUrl: "https://github.com/example/private-demo-app" }),
});
try {
  await shot("3-import-diagnosis", `/projects/${temp.id}/import`, {
    waitText: "couldn", // "We couldn't download your code"
    timeout: 45000,
  });
} finally {
  await fetch(`${BASE}/api/projects/${temp.id}`, { method: "DELETE" });
}

// 4. Chat — activity feed (top) + build-readiness card (bottom)
await shot("4b-chat-ready", `/projects/${expoProject.id}?tab=Chat`, {
  waitText: "ready to build",
  timeout: 25000,
});
await page.evaluate(() => {
  const feed = document.querySelector(".overflow-y-auto");
  if (feed) feed.scrollTop = 0;
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: path.join(OUT, "4-chat-activity.png") });
console.log("✓ 4-chat-activity.png");

// 5. Setup wizard — with the Apple step expanded
await shot("5-setup-wizard", `/projects/${expoProject.id}?tab=Setup`, {
  waitText: "Apple Developer",
  before: async () => {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        b.textContent.includes("Apple Developer Program")
      );
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 700));
  },
});

// 6. Settings — machine check + build modes
await shot("6-machine-check", "/settings", { waitText: "Where should builds run" });

await browser.close();
console.log(`\nDone → ${OUT}`);
