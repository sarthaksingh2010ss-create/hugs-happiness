(async function() {
    const data = await chrome.storage.local.get(["jsr_email", "jsr_pass", "jsr_user"]);

    async function jsrEngine() {
        // 1. SECURITY DETECTOR (Captcha/Cloudflare Check)
        const hasSecurity = !!(
            document.querySelector('iframe[src*="recaptcha"]') || 
            document.querySelector('.cf-turnstile') || 
            document.querySelector('#hcaptcha') ||
            document.body.innerHTML.includes("captcha")
        );

        // 2. ADAPTIVE SPEED (Milliseconds vs Human Mode)
        const actionDelay = hasSecurity ? (Math.random() * 3000 + 4000) : 500;
        console.log(`JSR AI: ${hasSecurity ? " Human Mode" : " Millisecond Mode"} | Delay: ${actionDelay}ms`);

        // 3. AUTO-FILLING ENGINE
        const inputs = document.querySelectorAll("input, select, textarea");
        inputs.forEach(i => {
            const fieldInfo = (i.name + i.id + i.placeholder + i.type).toLowerCase();
            if (fieldInfo.includes("email")) { if(!i.value) i.value = data.jsr_email; }
            else if (fieldInfo.includes("pass")) { if(!i.value) i.value = data.jsr_pass; }
            else if (fieldInfo.includes("user") || fieldInfo.includes("name")) { if(!i.value) i.value = data.jsr_user; }
        });

        // 4. SUPREME CLICKER (Targets Visible & Hidden Buttons)
        const actionWords = ["claim", "withdraw", "faucet", "collect", "earn", "login", "register", "verify", "bonus", "reward"];
        const elements = document.querySelectorAll("button, a, input[type='submit'], .btn, [role='button']");

        for (let el of elements) {
            const text = (el.innerText || el.value || "").toLowerCase().trim();
            if (actionWords.some(word => text.includes(word))) {
                
                setTimeout(() => {
                    el.style.outline = "8px solid gold"; // Target Highlight
                    el.click();
                    // Termux Log
                    fetch('http://localhost:9999/log-earning', {
                        method: 'POST',
                        body: JSON.stringify({ amount: 100, site: window.location.hostname })
                    }).catch(() => {});
                }, actionDelay);

                if (hasSecurity) break; // Security        
            }
        }
    }

    // 5. ANTI-IDLE BEHAVIOR (Scrolling & Movement)
    setInterval(() => {
        const scrollAmt = (Math.random() - 0.5) * 400;
        window.scrollBy({ top: scrollAmt, behavior: 'smooth' });
    }, 4500);

    // Initial Start & Infinite Loop
    setInterval(jsrEngine, 7000);
})();
