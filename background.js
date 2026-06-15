import { CONFIG } from './config.js';

const Logger = {
    async log(level, action, prompt, response) {
        const now = new Date();
        const timestamp = now.toISOString().replace('T', ' ').padEnd(23, '0').slice(0, 23);
        const logEntry = `${timestamp} | ${level.padEnd(7)} | ${action}\nPROMPT: ${prompt}\nRESPONSE: ${response}\n${'-'.repeat(80)}\n`;
        
        try {
            const data = await chrome.storage.local.get(['gemini_logs']);
            let logs = data.gemini_logs || "";
            logs += logEntry;
            
            // Keep logs within reasonable size (last 2MB)
            if (logs.length > 5000000) {
                logs = logs.slice(logs.length - 2000000);
            }
            await chrome.storage.local.set({ gemini_logs: logs });
        } catch(e) {
            console.error("Logger failed", e);
        }
    }
};

// Setup message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fetchMarketMood') {
        fetchMarketMood().then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }
    if (request.action === 'fetchStockPrice') {
        fetchStockPrice(request.ticker).then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }
    if (request.action === 'fetchStockAnalysis') {
        fetchStockAnalysis(request.ticker, request.priceData).then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }
    if (request.action === 'searchStock') {
        searchStock(request.query).then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }
    if (request.action === 'fetchIndices') {
        fetchStockPrice('^NSEI').then(nifty => {
            fetchStockPrice('^BSESN').then(sensex => {
                sendResponse({ nifty, sensex });
            }).catch(() => sendResponse({ nifty, sensex: null }));
        }).catch(() => sendResponse({ nifty: null, sensex: null }));
        return true;
    }
    if (request.action === 'fetchPortfolioScore') {
        fetchPortfolioScore(request.watchlistData).then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }
    if (request.action === 'compareStocks') {
        compareStocks(request.stock1, request.stock2).then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }
});

async function fetchMarketMood() {
    const prompt = "What is the current overall Indian stock market mood (bullish, bearish, neutral)? Provide a very short 1 sentence explanation. Format as JSON: {\"mood\": \"bullish|bearish|neutral\", \"explanation\": \"...\"}";

    return await callGeminiAPI(prompt, true, "fetchMarketMood");
}

async function fetchStockAnalysis(ticker, priceData) {
    const prompt = `I am analyzing Indian stock ${ticker} on NSE. Price: ₹${priceData.price}, Change: ${priceData.change}%. Provide a very brief, concise analysis (max 1 short sentence per field) in JSON format:
{
  "moving_reason": "1 short sentence reason",
  "short_term_impact": "Brief ST impact",
  "long_term_impact": "Brief LT impact",
  "risk_factors": ["risk 1", "risk 2"],
  "bull_case": "Brief bull case",
  "bear_case": "Brief bear case",
  "overall_sentiment": "Positive, Negative, or Neutral",
  "recommendation": "Buy, Hold, or Sell",
  "recommendation_reasoning": "1 short sentence reasoning"
}`;

    return await callGeminiAPI(prompt, true, "fetchStockAnalysis");
}

async function fetchPortfolioScore(watchlistData) {
    const prompt = `Analyze this portfolio of Indian stocks and their current performance: ${JSON.stringify(watchlistData)}. 
Provide a portfolio score from 0 to 100 based on diversification, short-term momentum, and stability. 
Provide a max 1 sentence reasoning. 
Format STRICTLY as JSON:
{
  "score": 85,
  "reason": "1 short sentence"
}`;
    return await callGeminiAPI(prompt, true, "fetchPortfolioScore");
}

async function compareStocks(stock1Data, stock2Data) {
    const prompt = `Perform a head-to-head comparison between these two Indian stocks: 
1: ${JSON.stringify(stock1Data)}
2: ${JSON.stringify(stock2Data)}
Provide brief, concise analysis (max 1 short sentence per field) in JSON format:
{
  "short_term_winner": "Ticker and brief reason",
  "long_term_winner": "Ticker and brief reason",
  "risk_comparison": "Brief risk comparison",
  "verdict": "Final verdict in 1 sentence"
}`;
    return await callGeminiAPI(prompt, true, "compareStocks");
}

async function callGeminiAPI(prompt, expectJson = false, actionName = "API_CALL") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: expectJson ? "application/json" : "text/plain"
            }
        })
    });

    if (!response.ok) {
        let errText = "Unknown error";
        try { errText = await response.text(); } catch (e) { }
        await Logger.log("ERROR", actionName, prompt, `HTTP ${response.status}: ${errText}`);
        throw new Error(`Failed to fetch from Gemini API (${response.status}): ${errText}`);
    }

    const data = await response.json();
    let text = data.candidates[0].content.parts[0].text;

    await Logger.log("INFO", actionName, prompt, text);

    if (expectJson) {
        try {
            return JSON.parse(text);
        } catch (e) {
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(text);
        }
    }
    return text;
}

async function searchStock(query) {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    const data = await response.json();
    return data.quotes
        .filter(q => q.exchange === 'NSI' || q.exchange === 'BSE' || q.quoteType === 'EQUITY')
        .slice(0, 5)
        .map(q => ({ symbol: q.symbol.replace('.NS', '').replace('.BO', ''), name: q.shortname || q.longname }));
}

// Yahoo finance fetch
async function fetchStockPrice(ticker) {
    let symbol = ticker.toUpperCase();
    if (!symbol.startsWith('^') && !symbol.endsWith('.NS')) {
        symbol += '.NS';
    }
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch Yahoo Finance for ${ticker}`);
    }
    const data = await response.json();
    if (!data.chart.result || data.chart.result.length === 0) {
        throw new Error("Ticker not found");
    }
    const result = data.chart.result[0];
    const meta = result.meta;

    const previousClose = meta.chartPreviousClose;
    const currentPrice = meta.regularMarketPrice;
    const change = (((currentPrice - previousClose) / previousClose) * 100).toFixed(2);

    return {
        ticker: meta.symbol.replace('.NS', '').replace('.BO', '').replace('^NSEI', 'NIFTY').replace('^BSESN', 'SENSEX'),
        name: meta.shortName || meta.longName || meta.symbol.replace('.NS', ''),
        price: currentPrice.toFixed(2),
        change: change
    };
}
