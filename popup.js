let watchlist = [];
let watchlistDataResults = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Load initial mood
    loadMarketMood();
    
    // Load watchlist from storage
    const data = await chrome.storage.local.get(['watchlist']);
    if (data.watchlist) {
        watchlist = data.watchlist;
        renderWatchlist();
    }

    // Add stock button
    document.getElementById('add-btn').addEventListener('click', handleAddStock);
    
    const input = document.getElementById('ticker-input');
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAddStock();
    });
    
    // Autocomplete
    let typingTimer;
    input.addEventListener('input', () => {
        clearTimeout(typingTimer);
        document.getElementById('autocomplete-list').classList.add('hidden');
        if (input.value.trim().length > 1) {
            typingTimer = setTimeout(() => fetchAutocomplete(input.value.trim()), 500);
        }
    });

    // Close modal
    document.getElementById('close-modal-btn').addEventListener('click', () => {
        document.getElementById('analysis-modal').classList.add('hidden');
    });

    // Compare logic
    document.getElementById('open-compare-btn').addEventListener('click', (e) => {
        e.preventDefault();
        const sel1 = document.getElementById('compare-stock-1');
        const sel2 = document.getElementById('compare-stock-2');
        sel1.innerHTML = '<option value="">Select Stock 1</option>';
        sel2.innerHTML = '<option value="">Select Stock 2</option>';
        
        watchlistDataResults.forEach(item => {
            sel1.innerHTML += `<option value="${item.ticker}">${item.name || item.ticker}</option>`;
            sel2.innerHTML += `<option value="${item.ticker}">${item.name || item.ticker}</option>`;
        });
        
        document.getElementById('compare-modal').classList.remove('hidden');
        document.getElementById('compare-results').classList.add('hidden');
    });
    
    document.getElementById('close-compare-btn').addEventListener('click', () => {
        document.getElementById('compare-modal').classList.add('hidden');
    });
    
    document.getElementById('run-compare-btn').addEventListener('click', () => {
        const t1 = document.getElementById('compare-stock-1').value;
        const t2 = document.getElementById('compare-stock-2').value;
        if (!t1 || !t2 || t1 === t2) return;
        
        const data1 = watchlistDataResults.find(d => d.ticker === t1);
        const data2 = watchlistDataResults.find(d => d.ticker === t2);
        
        document.getElementById('compare-loader').classList.remove('hidden');
        document.getElementById('compare-results').classList.add('hidden');
        
        chrome.runtime.sendMessage({ action: 'compareStocks', stock1: data1, stock2: data2 }, (res) => {
            document.getElementById('compare-loader').classList.add('hidden');
            if (res && !res.error) {
                document.getElementById('compare-results').classList.remove('hidden');
                document.getElementById('cmp-short').textContent = res.short_term_winner;
                document.getElementById('cmp-long').textContent = res.long_term_winner;
                document.getElementById('cmp-risk').textContent = res.risk_comparison;
                document.getElementById('cmp-verdict').textContent = res.verdict;
            } else {
                document.getElementById('cmp-verdict').textContent = "Error running comparison";
                document.getElementById('compare-results').classList.remove('hidden');
            }
        });
    });
});

async function loadMarketMood() {
    chrome.runtime.sendMessage({ action: 'fetchMarketMood' }, (response) => {
        if (response && !response.error) {
            const badge = document.getElementById('market-mood-badge');
            badge.textContent = response.mood;
            badge.className = `badge ${response.mood.toLowerCase()}`;
            document.getElementById('market-mood-text').textContent = response.explanation;
        } else {
            document.getElementById('market-mood-text').textContent = "Failed to load market mood.";
            document.getElementById('market-mood-badge').classList.add('hidden');
        }
    });
    
    chrome.runtime.sendMessage({ action: 'fetchIndices' }, (res) => {
        if (res) {
            if (res.nifty) {
                document.getElementById('nifty-text').innerHTML = `₹${res.nifty.price} <span class="change ${parseFloat(res.nifty.change) >= 0 ? 'up' : 'down'}">${parseFloat(res.nifty.change) >= 0 ? '+' : ''}${res.nifty.change}%</span>`;
            }
            if (res.sensex) {
                document.getElementById('sensex-text').innerHTML = `₹${res.sensex.price} <span class="change ${parseFloat(res.sensex.change) >= 0 ? 'up' : 'down'}">${parseFloat(res.sensex.change) >= 0 ? '+' : ''}${res.sensex.change}%</span>`;
            }
        }
    });
}

function fetchAutocomplete(query) {
    chrome.runtime.sendMessage({ action: 'searchStock', query }, (response) => {
        const list = document.getElementById('autocomplete-list');
        list.innerHTML = '';
        if (response && response.length > 0) {
            list.classList.remove('hidden');
            response.forEach(item => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.innerHTML = `<strong>${item.symbol}</strong> - ${item.name}`;
                div.addEventListener('click', () => {
                    document.getElementById('ticker-input').value = item.symbol;
                    list.classList.add('hidden');
                });
                list.appendChild(div);
            });
        }
    });
}

async function renderWatchlist() {
    const container = document.getElementById('watchlist-container');
    container.innerHTML = '';
    
    if (watchlist.length === 0) {
        document.getElementById('portfolio-score-section').classList.add('hidden');
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; font-size: 0.9rem;">No stocks in watchlist.</p>';
        return;
    }

    watchlistDataResults = [];
    
    const promises = watchlist.map(ticker => {
        const item = document.createElement('div');
        item.className = 'stock-item';
        item.innerHTML = `
            <div class="stock-info">
                <h3>${ticker}</h3>
                <p>Loading...</p>
            </div>
            <div class="stock-price">
                <div class="price">-</div>
                <div class="change">-</div>
            </div>
        `;
        container.appendChild(item);

        return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'fetchStockPrice', ticker }, (response) => {
                if (response && !response.error) {
                    watchlistDataResults.push({ticker, ...response});
                    const isUp = parseFloat(response.change) >= 0;
                    item.innerHTML = `
                        <div class="stock-main" style="display: flex; justify-content: space-between; flex: 1; align-items: center; cursor: pointer;">
                            <div class="stock-info" style="max-width: 65%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">
                                <h3 style="font-size: 0.9rem;">${response.name || ticker} <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: normal;">(${ticker})</span></h3>
                            </div>
                            <div class="stock-price">
                                <div class="price">₹${response.price}</div>
                                <div class="change ${isUp ? 'up' : 'down'}">${isUp ? '+' : ''}${response.change}%</div>
                            </div>
                        </div>
                        <button class="remove-btn" title="Remove">&times;</button>
                    `;
                    item.querySelector('.stock-main').addEventListener('click', () => openAnalysisModal(ticker, response));
                    item.querySelector('.remove-btn').addEventListener('click', async (e) => {
                        e.stopPropagation();
                        watchlist = watchlist.filter(t => t !== ticker);
                        await chrome.storage.local.set({ watchlist });
                        renderWatchlist();
                    });
                } else {
                    item.innerHTML = `
                        <div class="stock-main" style="display: flex; justify-content: space-between; flex: 1; align-items: center;">
                            <div class="stock-info">
                                <h3>${ticker}</h3>
                                <p style="color: var(--red);">Error</p>
                            </div>
                        </div>
                        <button class="remove-btn" title="Remove">&times;</button>
                    `;
                    item.querySelector('.remove-btn').addEventListener('click', async (e) => {
                        e.stopPropagation();
                        watchlist = watchlist.filter(t => t !== ticker);
                        await chrome.storage.local.set({ watchlist });
                        renderWatchlist();
                    });
                }
                resolve();
            });
        });
    });

    await Promise.all(promises);
    
    // Evaluate portfolio score
    if(watchlistDataResults.length > 0) {
        document.getElementById('portfolio-score-section').classList.remove('hidden');
        document.getElementById('portfolio-score-badge').className = 'score-circle loading';
        document.getElementById('portfolio-score-badge').textContent = '...';
        document.getElementById('portfolio-score-text').textContent = "Analyzing watchlist strength...";
        
        chrome.runtime.sendMessage({ action: 'fetchPortfolioScore', watchlistData: watchlistDataResults }, (resp) => {
            if (resp && !resp.error) {
                const b = document.getElementById('portfolio-score-badge');
                b.textContent = resp.score;
                b.className = 'score-circle ' + (resp.score >= 70 ? 'high' : (resp.score >= 40 ? 'med' : 'low'));
                document.getElementById('portfolio-score-text').textContent = resp.reason;
            } else {
                document.getElementById('portfolio-score-text').textContent = "Failed to calculate portfolio score.";
                document.getElementById('portfolio-score-badge').textContent = "?";
            }
        });
    }
}

async function handleAddStock() {
    const input = document.getElementById('ticker-input');
    const ticker = input.value.trim().toUpperCase();
    const errorMsg = document.getElementById('add-error');
    
    if (!ticker) return;
    if (watchlist.includes(ticker)) {
        errorMsg.textContent = "Ticker already in watchlist";
        return;
    }
    
    errorMsg.textContent = "";

    // Test ticker existence
    chrome.runtime.sendMessage({ action: 'fetchStockPrice', ticker }, async (response) => {
        if (response && !response.error) {
            watchlist.push(ticker);
            await chrome.storage.local.set({ watchlist });
            input.value = '';
            renderWatchlist();
        } else {
            errorMsg.textContent = "Invalid ticker symbol";
        }
    });
}

function openAnalysisModal(ticker, priceData) {
    const modal = document.getElementById('analysis-modal');
    document.getElementById('modal-title').textContent = `${ticker} AI Analysis`;
    modal.classList.remove('hidden');
    
    const rootDetails = document.getElementById('modal-content-details');
    const loader = document.getElementById('modal-loader');
    
    rootDetails.classList.add('hidden');
    loader.classList.remove('hidden');

    chrome.runtime.sendMessage({ action: 'fetchStockAnalysis', ticker, priceData }, (response) => {
        loader.classList.add('hidden');
        if (response && !response.error) {
            rootDetails.classList.remove('hidden');
            
            // Populate data
            const badge = document.getElementById('rec-badge');
            badge.textContent = response.recommendation;
            badge.className = `badge ${response.recommendation.toLowerCase()}`;
            
            document.getElementById('rec-reasoning').textContent = response.recommendation_reasoning;
            document.getElementById('moving-reason').textContent = response.moving_reason;
            document.getElementById('short-term').textContent = response.short_term_impact;
            document.getElementById('long-term').textContent = response.long_term_impact;
            document.getElementById('bull-case').textContent = response.bull_case;
            document.getElementById('bear-case').textContent = response.bear_case;
            
            const risksList = document.getElementById('risk-factors');
            risksList.innerHTML = '';
            response.risk_factors.forEach(risk => {
                const li = document.createElement('li');
                li.textContent = risk;
                risksList.appendChild(li);
            });
            
        } else {
            rootDetails.classList.remove('hidden');
            rootDetails.innerHTML = `<p style="color: var(--red);">Error analyzing stock: ${response.error || 'Unknown error'}</p>`;
        }
    });
}
