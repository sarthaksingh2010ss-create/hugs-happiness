// JSR AI Agent — ULTIMATE executor (v65). Every action a browser agent can do.
(function () {
  if (window.__JSR_EXECUTOR__) return;
  window.__JSR_EXECUTOR__ = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const waitForSelector = (sel, timeout = 12000) => new Promise((resolve, reject) => {
    const found = qs(sel);
    if (found) return resolve(found);
    const start = Date.now();
    const obs = new MutationObserver(() => {
      const el = qs(sel);
      if (el) { obs.disconnect(); resolve(el); }
      else if (Date.now() - start > timeout) { obs.disconnect(); reject(new Error("Timeout: " + sel)); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    setTimeout(() => { obs.disconnect(); const el = qs(sel); el ? resolve(el) : reject(new Error("Timeout: " + sel)); }, timeout);
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

  function findByText(text, tag = "button, a, [role=button], input[type=submit], [type=button]") {
    const t = String(text).toLowerCase().trim();
    for (const n of qsa(tag)) {
      const txt = (n.innerText || n.value || n.getAttribute("aria-label") || "").toLowerCase().trim();
      if (txt === t || txt.includes(t)) return n;
    }
    return null;
  }

  async function humanType(el, value, delay = 30) {
    el.focus();
    setReactValue(el, "");
    for (const ch of String(value)) {
      el.value = (el.value || "") + ch;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch }));
      await sleep(delay);
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function runStep(step) {
    switch (step.action) {
      case "fill": {
        const el = await waitForSelector(step.selector);
        el.focus();
        if (step.human) await humanType(el, step.value ?? "", step.delay ?? 40);
        else setReactValue(el, String(step.value ?? ""));
        return { ok: true };
      }
      case "click": {
        let el;
        if (step.text) el = findByText(step.text, step.selector || undefined);
        else el = await waitForSelector(step.selector);
        if (!el) throw new Error("Click target not found: " + (step.text || step.selector));
        el.scrollIntoView({ block: "center" });
        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        el.click();
        return { ok: true };
      }
      case "rightClick": {
        const el = await waitForSelector(step.selector);
        el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, button: 2 }));
        return { ok: true };
      }
      case "doubleClick": {
        const el = await waitForSelector(step.selector);
        el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        return { ok: true };
      }
      case "press": {
        const target = step.selector ? await waitForSelector(step.selector) : document.activeElement || document.body;
        const key = step.key ?? "Enter";
        const opts = { key, code: key, bubbles: true, ctrlKey: !!step.ctrl, shiftKey: !!step.shift, altKey: !!step.alt, metaKey: !!step.meta };
        target.dispatchEvent(new KeyboardEvent("keydown", opts));
        target.dispatchEvent(new KeyboardEvent("keypress", opts));
        target.dispatchEvent(new KeyboardEvent("keyup", opts));
        if (key === "Enter" && target.form) target.form.requestSubmit?.();
        return { ok: true };
      }
      case "wait": { await sleep(Number(step.ms) || 1000); return { ok: true }; }
      case "waitForSelector": { await waitForSelector(step.selector, step.timeout ?? 15000); return { ok: true }; }
      case "waitForText": {
        const t = String(step.text).toLowerCase();
        const deadline = Date.now() + (step.timeout ?? 15000);
        while (Date.now() < deadline) {
          if ((document.body.innerText || "").toLowerCase().includes(t)) return { ok: true };
          await sleep(300);
        }
        throw new Error("Timeout waiting for text: " + step.text);
      }
      case "waitForNetworkIdle": {
        await sleep(step.ms ?? 1500);
        return { ok: true };
      }
      case "scroll": {
        if (step.selector) (await waitForSelector(step.selector)).scrollIntoView({ behavior: "smooth", block: "center" });
        else if (step.to === "bottom") window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        else if (step.to === "top") window.scrollTo({ top: 0, behavior: "smooth" });
        else window.scrollBy({ top: Number(step.y) || 600, behavior: "smooth" });
        return { ok: true };
      }
      case "infiniteScroll": {
        const max = step.maxRounds ?? 10;
        let last = 0;
        for (let n = 0; n < max; n++) {
          window.scrollTo({ top: document.body.scrollHeight });
          await sleep(step.delay ?? 1200);
          if (document.body.scrollHeight === last) break;
          last = document.body.scrollHeight;
        }
        return { ok: true };
      }
      case "extract": {
        const el = await waitForSelector(step.selector);
        const text = (step.attribute ? el.getAttribute(step.attribute) : el.innerText) ?? "";
        return { ok: true, extracted: text.trim().slice(0, step.limit ?? 5000) };
      }
      case "extractAll": {
        await waitForSelector(step.selector, step.timeout ?? 8000).catch(() => null);
        const els = qsa(step.selector).slice(0, step.limit ?? 100);
        const items = els.map((el) => {
          if (step.fields) {
            const o = {};
            for (const [k, sel] of Object.entries(step.fields)) {
              const sub = el.querySelector(sel);
              o[k] = sub ? (sub.innerText || sub.getAttribute("href") || sub.getAttribute("src") || "").trim() : "";
            }
            return o;
          }
          return (step.attribute ? el.getAttribute(step.attribute) : el.innerText || "").trim();
        });
        return { ok: true, extracted: JSON.stringify(items, null, 2).slice(0, 10000) };
      }
      case "extractLinks": {
        const links = qsa("a[href]").map((a) => ({ text: a.innerText.trim(), href: a.href })).slice(0, step.limit ?? 200);
        return { ok: true, extracted: JSON.stringify(links, null, 2).slice(0, 10000) };
      }
      case "extractImages": {
        const imgs = qsa("img[src]").map((i) => i.src).slice(0, step.limit ?? 100);
        return { ok: true, extracted: JSON.stringify(imgs, null, 2) };
      }
      case "extractTable": {
        const t = await waitForSelector(step.selector || "table");
        const rows = qsa("tr", t).map((r) => qsa("th,td", r).map((c) => c.innerText.trim()));
        return { ok: true, extracted: JSON.stringify(rows, null, 2).slice(0, 10000) };
      }
      case "pageText": return { ok: true, extracted: (document.body.innerText || "").slice(0, step.limit ?? 10000) };
      case "pageHtml": return { ok: true, extracted: document.documentElement.outerHTML.slice(0, step.limit ?? 15000) };
      case "pageTitle": return { ok: true, extracted: document.title };
      case "pageUrl": return { ok: true, extracted: location.href };
      case "eval": {
        const fn = new Function("return (async () => { " + step.code + " })()");
        const out = await fn();
        return { ok: true, extracted: typeof out === "string" ? out : JSON.stringify(out)?.slice(0, 10000) };
      }
      case "injectCSS": {
        const s = document.createElement("style"); s.textContent = step.css; document.head.appendChild(s);
        return { ok: true };
      }
      case "hover": {
        const el = await waitForSelector(step.selector);
        ["mouseover", "mouseenter", "mousemove"].forEach((t) => el.dispatchEvent(new MouseEvent(t, { bubbles: true })));
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
        el.value = step.value; el.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true };
      }
      case "checkbox": {
        const el = await waitForSelector(step.selector);
        if (el.checked !== !!step.checked) el.click();
        return { ok: true };
      }
      case "focus": { (await waitForSelector(step.selector)).focus(); return { ok: true }; }
      case "blur": { (await waitForSelector(step.selector)).blur?.(); return { ok: true }; }
      case "exists": {
        const el = qs(step.selector);
        return { ok: true, extracted: el ? "true" : "false" };
      }
      case "count": {
        return { ok: true, extracted: String(qsa(step.selector).length) };
      }
      case "back": { history.back(); return { ok: true }; }
      case "forward": { history.forward(); return { ok: true }; }
      case "reload": { location.reload(); return { ok: true }; }
      default: throw new Error("Unknown action: " + step.action);
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== "JSR_EXEC_STEP") return false;
    runStep(msg.step).then(sendResponse).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  });
})();
