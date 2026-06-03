// JSR AI Agent — content executor. Runs one step at a time in the page.

(function () {
  if (window.__JSR_EXECUTOR__) return;
  window.__JSR_EXECUTOR__ = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const waitForSelector = (sel, timeout = 8000) => new Promise((resolve, reject) => {
    const found = document.querySelector(sel);
    if (found) return resolve(found);
    const start = Date.now();
    const obs = new MutationObserver(() => {
      const el = document.querySelector(sel);
      if (el) { obs.disconnect(); resolve(el); }
      else if (Date.now() - start > timeout) { obs.disconnect(); reject(new Error("Timeout: " + sel)); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); reject(new Error("Timeout: " + sel)); }, timeout);
  });

  const setReactValue = (el, value) => {
    const proto = el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  async function runStep(step) {
    switch (step.action) {
      case "fill": {
        const el = await waitForSelector(step.selector);
        el.focus();
        setReactValue(el, String(step.value ?? ""));
        return { ok: true };
      }
      case "click": {
        const el = await waitForSelector(step.selector);
        el.click();
        return { ok: true };
      }
      case "press": {
        const target = step.selector ? await waitForSelector(step.selector) : document.activeElement || document.body;
        const key = step.key ?? "Enter";
        const opts = { key, code: key, bubbles: true };
        target.dispatchEvent(new KeyboardEvent("keydown", opts));
        target.dispatchEvent(new KeyboardEvent("keypress", opts));
        target.dispatchEvent(new KeyboardEvent("keyup", opts));
        if (key === "Enter" && target.form) target.form.requestSubmit?.();
        return { ok: true };
      }
      case "wait": {
        await sleep(Number(step.ms) || 1000);
        return { ok: true };
      }
      case "waitForSelector": {
        await waitForSelector(step.selector, step.timeout ?? 10000);
        return { ok: true };
      }
      case "scroll": {
        if (step.selector) {
          const el = await waitForSelector(step.selector);
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          window.scrollBy({ top: Number(step.y) || 600, behavior: "smooth" });
        }
        return { ok: true };
      }
      case "extract": {
        const el = await waitForSelector(step.selector);
        const text = (step.attribute ? el.getAttribute(step.attribute) : el.innerText) ?? "";
        return { ok: true, extracted: text.trim().slice(0, 2000) };
      }
      default:
        throw new Error("Unknown action: " + step.action);
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== "JSR_EXEC_STEP") return false;
    runStep(msg.step).then(sendResponse).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  });
})();
