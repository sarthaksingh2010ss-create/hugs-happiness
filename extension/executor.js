// JSR AI Agent — ULTIMATE executor (v64). Runs every step type in-page.
(function () {
  if (window.__JSR_EXECUTOR__) return;
  window.__JSR_EXECUTOR__ = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const waitForSelector = (sel, timeout = 10000) => new Promise((resolve, reject) => {
    const found = document.querySelector(sel);
    if (found) return resolve(found);
    const start = Date.now();
    const obs = new MutationObserver(() => {
      const el = document.querySelector(sel);
      if (el) { obs.disconnect(); resolve(el); }
      else if (Date.now() - start > timeout) { obs.disconnect(); reject(new Error("Timeout: " + sel)); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); const el = document.querySelector(sel); el ? resolve(el) : reject(new Error("Timeout: " + sel)); }, timeout);
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

  function findByText(text, tag = "*") {
    const t = String(text).toLowerCase().trim();
    const nodes = document.querySelectorAll(tag);
    for (const n of nodes) {
      const txt = (n.innerText || n.value || "").toLowerCase().trim();
      if (txt === t || txt.includes(t)) return n;
    }
    return null;
  }

  async function runStep(step) {
    switch (step.action) {
      case "fill": {
        const el = await waitForSelector(step.selector);
        el.focus();
        setReactValue(el, String(step.value ?? ""));
        return { ok: true };
      }
      case "click": {
        let el;
        if (step.text) el = findByText(step.text, step.selector || "button, a, [role=button], input[type=submit]");
        else el = await waitForSelector(step.selector);
        if (!el) throw new Error("Click target not found: " + (step.text || step.selector));
        el.scrollIntoView({ block: "center" });
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
        await waitForSelector(step.selector, step.timeout ?? 15000);
        return { ok: true };
      }
      case "waitForText": {
        const t = String(step.text).toLowerCase();
        const deadline = Date.now() + (step.timeout ?? 15000);
        while (Date.now() < deadline) {
          if ((document.body.innerText || "").toLowerCase().includes(t)) return { ok: true };
          await sleep(300);
        }
        throw new Error("Timeout waiting for text: " + step.text);
      }
      case "scroll": {
        if (step.selector) {
          const el = await waitForSelector(step.selector);
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        } else if (step.to === "bottom") {
          window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        } else {
          window.scrollBy({ top: Number(step.y) || 600, behavior: "smooth" });
        }
        return { ok: true };
      }
      case "extract": {
        const el = await waitForSelector(step.selector);
        const text = (step.attribute ? el.getAttribute(step.attribute) : el.innerText) ?? "";
        return { ok: true, extracted: text.trim().slice(0, 5000) };
      }
      case "extractAll": {
        await waitForSelector(step.selector, step.timeout ?? 8000).catch(() => null);
        const els = Array.from(document.querySelectorAll(step.selector));
        const items = els.slice(0, step.limit ?? 50).map((el) => {
          if (step.fields) {
            const o = {};
            for (const [k, sel] of Object.entries(step.fields)) {
              const sub = el.querySelector(sel);
              o[k] = sub ? (sub.innerText || sub.getAttribute("href") || "").trim() : "";
            }
            return o;
          }
          return (step.attribute ? el.getAttribute(step.attribute) : el.innerText || "").trim();
        });
        return { ok: true, extracted: JSON.stringify(items, null, 2).slice(0, 8000) };
      }
      case "pageText": {
        return { ok: true, extracted: (document.body.innerText || "").slice(0, step.limit ?? 8000) };
      }
      case "pageHtml": {
        return { ok: true, extracted: document.documentElement.outerHTML.slice(0, step.limit ?? 12000) };
      }
      case "eval": {
        // Run arbitrary JS in page context. Return value becomes extracted.
        const fn = new Function("return (async () => { " + step.code + " })()");
        const out = await fn();
        return { ok: true, extracted: typeof out === "string" ? out : JSON.stringify(out)?.slice(0, 8000) };
      }
      case "hover": {
        const el = await waitForSelector(step.selector);
        el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        return { ok: true };
      }
      case "submit": {
        const el = await waitForSelector(step.selector || "form");
        const form = el.tagName === "FORM" ? el : el.closest("form");
        form?.requestSubmit ? form.requestSubmit() : form?.submit();
        return { ok: true };
      }
      case "selectOption": {
        const el = await waitForSelector(step.selector);
        el.value = step.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true };
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
