const JSR_IDENTITY = {
    "jsr_email": "jsr_ai_beast@gmail.com",
    "jsr_pass": "JSR_Alpha_9999",
    "jsr_user": "jsr_beast_007"
};

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set(JSR_IDENTITY);
});

chrome.alarms.create("JSR_CORE_PULSE", { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "JSR_CORE_PULSE") {
        const tabs = await chrome.tabs.query({});
        if (tabs.length < 20) {
            const searchTerms = ["high payout crypto faucets", "best automatic earning sites 2026", "instant withdraw rewards"];
            const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];
            chrome.tabs.create({ 
                url: `https://google.com/search?q=${encodeURIComponent(term)}`, 
                active: false 
            });
        }
    }
});
