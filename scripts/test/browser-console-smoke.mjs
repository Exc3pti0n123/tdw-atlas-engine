#!/usr/bin/env node

import { chromium } from 'playwright';

const baseUrl = process.env.TDW_ATLAS_BASE_URL || 'https://thedesertwhale.local';
const pagePath = process.env.TDW_ATLAS_PAGE_PATH || '/laenderinfo-startseite/';
const url = `${baseUrl}${pagePath}`;
const expectedErrorRegex = new RegExp(
  process.env.TDW_ATLAS_EXPECTED_ERROR_REGEX || 'Unknown map id:|Missing map id \\(data-map-id\\)',
  'i'
);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();

const consoleEntries = [];
const pageErrors = [];
const failedRequests = [];

page.on('console', (msg) => {
  consoleEntries.push({
    type: msg.type(),
    text: msg.text(),
  });
});

page.on('pageerror', (err) => {
  pageErrors.push(String(err?.message || err));
});

page.on('requestfailed', (req) => {
  failedRequests.push({
    method: req.method(),
    url: req.url(),
    error: req.failure()?.errorText || 'unknown',
  });
});

const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
if (!response || response.status() !== 200) {
  throw new Error(`[browser] page load failed for ${url} (status=${response?.status?.() ?? 'no-response'}).`);
}

const atlasContainers = await page.locator('.tdw-atlas').count();
if (atlasContainers < 1) {
  throw new Error('[browser] no .tdw-atlas containers found on target page.');
}

if (pageErrors.length > 0) {
  throw new Error(`[browser] unexpected pageerror events: ${pageErrors.join(' | ')}`);
}

const atlasAssetRequestFailures = failedRequests.filter((entry) => (
  entry.url.includes('/wp-content/plugins/tdw-atlas-engine/')
  || entry.url.includes('/wp-json/tdw-atlas/')
));
if (atlasAssetRequestFailures.length > 0) {
  const sample = atlasAssetRequestFailures
    .slice(0, 5)
    .map((e) => `${e.method} ${e.url} :: ${e.error}`)
    .join(' | ');
  throw new Error(`[browser] atlas request failures detected: ${sample}`);
}

const unexpectedConsoleErrors = consoleEntries.filter((entry) => {
  if (entry.type !== 'error') return false;
  if (!entry.text.includes('[TDW]') && !entry.text.includes('TDW Error')) return false;
  if (expectedErrorRegex.test(entry.text)) return false;
  return true;
});

if (unexpectedConsoleErrors.length > 0) {
  const sample = unexpectedConsoleErrors
    .slice(0, 5)
    .map((e) => e.text)
    .join(' | ');
  throw new Error(`[browser] unexpected TDW console errors: ${sample}`);
}

const tdwLogs = consoleEntries.filter((entry) => (
  entry.text.includes('[TDW]')
  || entry.text.includes('TDW Error')
));

console.log(`[browser] URL: ${url}`);
console.log(`[browser] atlas containers: ${atlasContainers}`);
console.log(`[browser] TDW console entries: ${tdwLogs.length}`);
console.log(`[browser] expected TDW errors ignored by regex: ${expectedErrorRegex}`);
console.log('[browser] OK');

await context.close();
await browser.close();
