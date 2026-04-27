const { chromium } = require('playwright');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const GEMINI_API_KEY = "AIzaSyDj7qbttjZrITf4DvYCFiUWTBiOtIeBY7Y";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function runAgent() {
    const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
            try {
                    const targetUrl = "https://tradingview.com"; 
                            await page.goto(targetUrl, { waitUntil: 'networkidle' });

                                    const pageText = await page.innerText('body');
                                            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                                                    
                                                            const prompt = `Analyze this site: ${targetUrl}. Find 'Buy' or 'Trade' button. Return JSON: {"selector": "button_css_selector"}`;
                                                                    const result = await model.generateContent(prompt);
                                                                            const decision = JSON.parse(result.response.text().replace(/\\`\\`\\`json|\\`\\`\\`/g, ""));

                                                                                    // Smart execution based on security
                                                                                            const isHighSec = await page.evaluate(() => !!document.querySelector('iframe, .captcha'));
                                                                                                    if (isHighSec) {
                                                                                                                await page.mouse.move(Math.random()*500, Math.random()*500);
                                                                                                                            await page.waitForTimeout(2000);
                                                                                                                                    }
                                                                                                                                            await page.click(decision.selector);
                                                                                                                                                    console.log("SUCCESS: Action performed on " + targetUrl);
                                                                                                                                                        } catch (e) { console.error("ERROR:", e.message); }
                                                                                                                                                            await browser.close();
                                                                                                                                                            }
                                                                                                                                                            runAgent();
                                                                                                                                                            