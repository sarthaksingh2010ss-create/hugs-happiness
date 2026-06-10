// JSR AI Agent — background. Opens tabs and orchestrates plan execution.

function waitForTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.webNavigation.onCompleted.removeListener(listener);
      reject(new Error("Tab load timeout"));
    }, timeoutMs);
    const listener = (details) => {
      if (details.tabId === tabId && details.frameId === 0) {
        clearTimeout(timer);
        chrome.webNavigation.onCompleted.removeListener(listener);
        setTimeout(resolve, 800);
      }
    };
    chrome.webNavigation.onCompleted.addListener(listener);
  });
}

async function ensureExecutor(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["executor.js"],
    });
  } catch (e) {
    console.warn("[JSR] executor inject failed:", e.message);
  }
}

async function execInTab(tabId, step) {
  await ensureExecutor(tabId);
  return await chrome.tabs.sendMessage(tabId, { type: "JSR_EXEC_STEP", step });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "JSR_RUN_PLAN") return false;
  (async () => {
    let tabId = null;
    try {
      const plan = msg.plan;
      const tab = await chrome.tabs.create({ url: plan.url, active: true });
      tabId = tab.id;
      await waitForTabComplete(tab.id);
      await ensureExecutor(tab.id);

      const results = [];
      const extracted = [];
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];

        // Skip a redundant initial navigate to the same URL we already opened.
        if (step.action === "navigate" && step.url) {
          if (i === 0 && step.url === plan.url) {
            results.push({ step: i, ok: true, skipped: "already on url" });
            continue;
          }
          await chrome.tabs.update(tab.id, { url: step.url });
          await waitForTabComplete(tab.id);
          await ensureExecutor(tab.id);
          results.push({ step: i, ok: true });
          continue;
        }

        try {
          const res = await execInTab(tab.id, step);
          results.push({ step: i, action: step.action, ...res });
          if (res?.extracted) extracted.push(res.extracted);
          if (step.action === "click" || step.action === "press") {
            await new Promise((r) => setTimeout(r, 1000));
            await ensureExecutor(tab.id);
          }
        } catch (e) {
          results.push({ step: i, action: step.action, ok: false, error: e.message });
          if (step.required !== false) break;
        }
      }
      sendResponse({ ok: true, results, extracted, tabId });
    } catch (e) {
      sendResponse({ ok: false, error: e.message, tabId });
    }
  })();
  return true;
});
