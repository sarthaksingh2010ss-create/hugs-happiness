const $ = (id) => document.getElementById(id);
const setStatus = (msg, err = false) => { const s = $("status"); s.textContent = msg; s.className = err ? "err" : ""; };

$("clear").addEventListener("click", () => { $("plan").value = ""; setStatus(""); });

$("run").addEventListener("click", async () => {
  const raw = $("plan").value.trim();
  if (!raw) return setStatus("Plan empty hai.", true);
  let plan;
  try { plan = JSON.parse(raw); } catch (e) { return setStatus("Invalid JSON: " + e.message, true); }
  if (!plan.url || !Array.isArray(plan.steps)) return setStatus("Plan mein 'url' aur 'steps' chahiye.", true);

  setStatus("Tab open kar raha hoon…");
  try {
    const resp = await chrome.runtime.sendMessage({ type: "JSR_RUN_PLAN", plan });
    if (resp?.ok) {
      setStatus(`✓ Plan finished. ${resp.results?.length ?? 0} steps executed.`);
      if (resp.results?.some((r) => r.extracted)) {
        const extracted = resp.results.filter((r) => r.extracted).map((r) => `[${r.step}] ${r.extracted}`).join("\n");
        $("plan").value = "// EXTRACTED:\n" + extracted + "\n\n// ORIGINAL PLAN:\n" + raw;
      }
    } else {
      setStatus("✗ " + (resp?.error ?? "Unknown error"), true);
    }
  } catch (e) {
    setStatus("✗ " + e.message, true);
  }
});
