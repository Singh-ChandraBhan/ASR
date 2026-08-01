import fs from "node:fs/promises";
import path from "node:path";

const outputDirectory = "_site";
await fs.rm(outputDirectory, { recursive: true, force: true });
await fs.mkdir(outputDirectory, { recursive: true });

let html = await fs.readFile("index.html", "utf8");
const chatbotApiUrl = (process.env.PAGES_CHATBOT_API_URL || "").trim();

if (chatbotApiUrl) {
  // Only an HTTPS backend should be injected into a public HTTPS Pages site.
  const parsed = new URL(chatbotApiUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("PAGES_CHATBOT_API_URL must use HTTPS.");
  }
  html = html.replace(
    /(<meta name="chatbot-api" content=")[^"]*(">)/,
    `$1${parsed.href.replace(/\/$/, "")}/api/chat$2`,
  );
} else {
  // Empty URL makes the widget use its built-in FAQ fallback on GitHub Pages.
  html = html.replace(
    /(<meta name="chatbot-api" content=")[^"]*(">)/,
    "$1https://api-not-configured.invalid/api/chat$2",
  );
}

await fs.writeFile(path.join(outputDirectory, "index.html"), html);
await fs.cp("assets", path.join(outputDirectory, "assets"), { recursive: true });
await fs.cp("commerce", path.join(outputDirectory, "commerce"), { recursive: true });

const commerceApiUrl = (process.env.PAGES_COMMERCE_API_URL || "").trim();
if (commerceApiUrl) {
  const parsed = new URL(commerceApiUrl);
  if (parsed.protocol !== "https:") throw new Error("PAGES_COMMERCE_API_URL must use HTTPS.");
  const commerceIndex = path.join(outputDirectory, "commerce", "index.html");
  let commerceHtml = await fs.readFile(commerceIndex, "utf8");
  commerceHtml = commerceHtml.replace(
    /(<meta name="commerce-api" content=")[^"]*(">)/,
    `$1${parsed.href.replace(/\/$/, "")}$2`,
  );
  await fs.writeFile(commerceIndex, commerceHtml);
}
await fs.writeFile(path.join(outputDirectory, ".nojekyll"), "");

console.log(`GitHub Pages artifact created in ${outputDirectory}`);
console.log(`Chatbot API: ${chatbotApiUrl || "offline FAQ fallback"}`);
