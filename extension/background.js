// JSR AI Agent — ULTIMATE background (v64).
// Orchestrates multi-step plans with control flow: loop, if, goto, openTab,
// switchTab, closeTab, httpRequest, screenshot, downloadFile, setStorage,
// getStorage, cookies, and an AUTONOMOUS askAI step that feeds extracted
// data back to the JSR AI chat function and executes the returned plan —
// all without user intervention.

const SESSION = { lastTabId: null, tabs: new Map(), vars: {} };

function waitForTabComplete(tabId, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.webNavigation.onCompleted.removeListener(listener);
      reject(new Error("Tab load timeout"));
    }, timeoutMs);
    const listener = (d) => {
      if (d.tabId === tabId && d.frameId === 0) {
        clearTimeout(timer);
        chrome.webNavigation.onCompleted.removeListener(listener);
        setTimeout(resolve, 700);
      }
    };
    chrome.webNavigation.onCompleted.addListener(listener);
  });
}

async function ensureExecutor(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["executor.js"] });
  } catch (e) { /* may be restricted page */ }
}

async function execInTab(tabId, step) {
  await ensureExecutor(tabId);
  return await chrome.tabs.sendMessage(tabId, { type: "JSR_EXEC_STEP", step });
}

// Resolve {{var}} in step strings
function interpolate(step, vars) {
  const out = JSON.parse(JSON.stringify(step));
  const walk = (o) => {
    for (const k in o) {
      if (typeof o[k] === "string") o[k] = o[k].replace(/\{\{(\w+)\}\}/g, (_, n) => vars[n] ?? "");
      else if (typeof o[k] === "object" && o[k]) walk(o[k]);
    }
  };
  walk(out);
  return out;
}

async function runPlan(plan, ctx) {
  const results = [];
  const extracted = [];
  let tabId = ctx.tabId;

  if (!tabId) {
    const tab = await chrome.tabs.create({ url: plan.url || "about:blank", active: true });
    tabId = tab.id;
    SESSION.lastTabId = tabId;
    if (plan.url) await waitForTabComplete(tabId);
    await ensureExecutor(tabId);
  }

  const steps = plan.steps || [];
  let i = 0;
  const maxIter = plan.maxSteps ?? 200;
  let iter = 0;

  while (i < steps.length && iter++ < maxIter) {
    const raw = steps[i];
    const step = interpolate(raw, SESSION.vars);

    try {
      // --- Control flow (handled in background) ---
      if (step.action === "navigate") {
        const url = step.url;
        if (url) {
          await chrome.tabs.update(tabId, { url });
          await waitForTabComplete(tabId);
          await ensureExecutor(tabId);
        }
        results.push({ step: i, action: "navigate", ok: true });
        i++; continue;
      }

      if (step.action === "openTab") {
        const tab = await chrome.tabs.create({ url: step.url, active: step.active !== false });
        await waitForTabComplete(tab.id);
        await ensureExecutor(tab.id);
        if (step.name) SESSION.tabs.set(step.name, tab.id);
        tabId = tab.id; SESSION.lastTabId = tabId;
        results.push({ step: i, action: "openTab", ok: true, tabId });
        i++; continue;
      }

      if (step.action === "switchTab") {
        const id = step.name ? SESSION.tabs.get(step.name) : step.tabId;
        if (!id) throw new Error("No such tab: " + (step.name || step.tabId));
        tabId = id; SESSION.lastTabId = id;
        await chrome.tabs.update(id, { active: true });
        results.push({ step: i, ok: true });
        i++; continue;
      }

      if (step.action === "closeTab") {
        const id = step.name ? SESSION.tabs.get(step.name) : (step.tabId || tabId);
        await chrome.tabs.remove(id).catch(() => {});
        results.push({ step: i, ok: true });
        i++; continue;
      }

      if (step.action === "setVar") {
        SESSION.vars[step.name] = step.value;
        results.push({ step: i, ok: true });
        i++; continue;
      }

      if (step.action === "loop") {
        const times = Number(step.times) || 1;
        for (let n = 0; n < times; n++) {
          SESSION.vars[step.indexVar || "i"] = n;
          const sub = await runPlan({ steps: step.steps }, { tabId });
          results.push({ step: i, iter: n, sub: sub.results });
          extracted.push(...sub.extracted);
        }
        i++; continue;
      }

      if (step.action === "if") {
        // condition: { exists: "selector" } or { containsText: "..." } or { equals: ["{{a}}","b"] }
        const c = step.condition || {};
        let pass = false;
        if (c.exists) {
          const r = await execInTab(tabId, { action: "waitForSelector", selector: c.exists, timeout: c.timeout ?? 1500 }).catch(() => null);
          pass = !!(r && r.ok);
        } else if (c.containsText) {
          const r = await execInTab(tabId, { action: "pageText" });
          pass = (r.extracted || "").toLowerCase().includes(String(c.containsText).toLowerCase());
        } else if (c.equals) {
          pass = String(c.equals[0]) === String(c.equals[1]);
        }
        const branch = pass ? step.then : step.else;
        if (Array.isArray(branch)) {
          const sub = await runPlan({ steps: branch }, { tabId });
          results.push({ step: i, branch: pass ? "then" : "else", sub: sub.results });
          extracted.push(...sub.extracted);
        }
        i++; continue;
      }

      if (step.action === "goto") {
        i = Number(step.index) || 0;
        continue;
      }

      if (step.action === "httpRequest") {
        const resp = await fetch(step.url, {
          method: step.method || "GET",
          headers: step.headers || {},
          body: step.body ? (typeof step.body === "string" ? step.body : JSON.stringify(step.body)) : undefined,
        });
        const text = await resp.text();
        const out = text.slice(0, 8000);
        if (step.saveAs) SESSION.vars[step.saveAs] = out;
        extracted.push(out);
        results.push({ step: i, ok: resp.ok, status: resp.status });
        i++; continue;
      }

      if (step.action === "screenshot") {
        const dataUrl = await chrome.tabs.captureVisibleTab();
        results.push({ step: i, ok: true, screenshot: dataUrl.slice(0, 100) + "…(truncated)" });
        i++; continue;
      }

      if (step.action === "downloadFile") {
        await chrome.downloads.download({ url: step.url, filename: step.filename });
        results.push({ step: i, ok: true });
        i++; continue;
      }

      if (step.action === "setStorage") {
        await chrome.storage.local.set({ [step.key]: step.value });
        results.push({ step: i, ok: true });
        i++; continue;
      }

      if (step.action === "getStorage") {
        const v = await chrome.storage.local.get(step.key);
        SESSION.vars[step.saveAs || step.key] = v[step.key];
        results.push({ step: i, ok: true });
        i++; continue;
      }

      if (step.action === "getCookies") {
        const cookies = await chrome.cookies.getAll({ url: step.url });
        const out = JSON.stringify(cookies);
        if (step.saveAs) SESSION.vars[step.saveAs] = out;
        extracted.push(out);
        results.push({ step: i, ok: true });
        i++; continue;
      }

      // AUTONOMOUS: send extracted data to JSR AI, get next plan, run it.
      if (step.action === "askAI") {
        const payload = step.prompt + "\n\nDATA:\n" + (step.data || SESSION.vars[step.dataVar] || extracted.join("\n---\n"));
        const r = await fetch(step.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(step.headers || {}) },
          body: JSON.stringify({ messages: [{ role: "user", content: payload }] }),
        });
        const txt = await r.text();
        // try to parse a jsr-plan block
        const m = txt.match(/```jsr-plan\s*\n([\s\S]*?)```/);
        if (m) {
          const nextPlan = JSON.parse(m[1]);
          const sub = await runPlan(nextPlan, { tabId });
          results.push({ step: i, askAI: true, sub: sub.results });
          extracted.push(...sub.extracted);
        } else {
          extracted.push(txt.slice(0, 4000));
          results.push({ step: i, askAI: true, ok: true, note: "no plan returned" });
        }
        i++; continue;
      }

      // --- Delegate to in-page executor ---
      const res = await execInTab(tabId, step);
      results.push({ step: i, action: step.action, ...res });
      if (res?.extracted) {
        extracted.push(res.extracted);
        if (step.saveAs) SESSION.vars[step.saveAs] = res.extracted;
      }
      if (step.action === "click" || step.action === "submit" || step.action === "press") {
        await new Promise((r) => setTimeout(r, step.afterDelay ?? 1200));
        await ensureExecutor(tabId);
      }
    } catch (e) {
      results.push({ step: i, action: step.action, ok: false, error: e.message });
      if (step.required !== false && !step.continueOnError) break;
    }
    i++;
  }

  return { results, extracted, tabId };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "JSR_RUN_PLAN") return false;
  (async () => {
    try {
      // reset vars per top-level plan unless told otherwise
      if (!msg.plan.keepVars) SESSION.vars = {};
      const out = await runPlan(msg.plan, {});
      sendResponse({ ok: true, ...out });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});
