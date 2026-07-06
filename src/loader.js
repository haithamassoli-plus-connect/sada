// src/loader.js (isolated world) — its only job is to load the orchestrator as
// an ES module. Content scripts can't be modules directly, so we dynamic-import
// the web-accessible content.js from the extension origin.
import(chrome.runtime.getURL('src/content.js'));
