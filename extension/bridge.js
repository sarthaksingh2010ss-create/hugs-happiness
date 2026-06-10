// JSR AI Agent — page bridge. Runs on JSR AI app pages and relays plans
// from window.postMessage (web page) to the extension background.
(function () {
  if (window.__JSR_BRIDGE__) return;
  window.__JSR_BRIDGE__ = true;

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const data = e.data;
    if (!data || data.source !== "jsr-ai-web" || data.type !== "JSR_RUN_PLAN") return;
    if (!data.plan || !data.plan.url || !Array.isArray(data.plan.steps)) return;

    // Acknowledge so the page knows the extension is installed.
    window.postMessage({ type: "JSR_PLAN_ACK" }, "*");

    chrome.runtime.sendMessage({ type: "JSR_RUN_PLAN", plan: data.plan }, (resp) => {
      window.postMessage({ type: "JSR_PLAN_RESULT", result: resp }, "*");
    });
  });

  // Announce presence so the page can show "Agent connected" UI if it wants.
  window.postMessage({ type: "JSR_AGENT_PRESENT", version: "62.0" }, "*");
  console.log("[JSR AI Agent] Bridge active on", window.location.hostname);
})();
