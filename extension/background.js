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
        setTimeout(resolve, 500); // small grace for dynamic content
      }
    };
    chrome.webNavigation.onCompleted.addListener(listener);
  });
}

async function execInTab(tabId, step) {
  // Send step to the content executor and await its reply.
  return await chrome.tabs.sendMessage(tabId, { type: "JSR_EXEC_STEP", step });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "JSR_RUN_PLAN") return false;
  (async () => {
    try {
      const plan = msg.plan;
      const tab = await chrome.tabs.create({ url: plan.url, active: true });
      await waitForTabComplete(tab.id);

      const results = [];
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];

        if (step.action === "navigate" && step.url) {
          await chrome.tabs.update(tab.id, { url: step.url });
          await waitForTabComplete(tab.id);
          results.push({ step: i, ok: true });
          continue;
        }

        try {
          const res = await execInTab(tab.id, step);
          results.push({ step: i, ...res });
          // If a click likely triggered navigation, wait for it (best-effort)
          if (step.action === "click" || step.action === "press") {
            await new Promise((r) => setTimeout(r, 800));
          }
        } catch (e) {
          results.push({ step: i, ok: false, error: e.message });
          if (step.required !== false) break;
        }
      }
      sendResponse({ ok: true, results });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // async
});
