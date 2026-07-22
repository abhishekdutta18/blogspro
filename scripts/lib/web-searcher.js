import * as cheerio from 'cheerio';
import { askMultipleAIWithConsensus } from './ai-service.js';

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export async function fetchInternetSearch(query, env) {
    try {
        console.log(`🌐 [WebSearch] Searching open internet for: "${query}"`);
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 15000); // 15s timeout
        
        const response = await fetch(url, {
            headers: {
                "User-Agent": UA,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5"
            },
            signal: controller.signal
        });
        clearTimeout(id);
        
        if (!response.ok) {
            console.warn(`⚠️ [WebSearch] Failed with status ${response.status}`);
            return `Search failed for: ${query}`;
        }

        const html = await response.text();
        
        let results = [];
        
        try {
            const $ = cheerio.load(html);
            $('.result__body').each((i, el) => {
                if (i >= 5) return;
                const title = $(el).find('.result__title').text().trim();
                const snippet = $(el).find('.result__snippet').text().trim();
                if (title && snippet) {
                    results.push(`* ${title}: ${snippet}`);
                }
            });
        } catch (e) {
            // Regex fallback if cheerio is not installed/fails
            const snippetRegex = /<a class="result__snippet[^>]*>(.*?)<\/a>/gs;
            let match;
            let count = 0;
            while ((match = snippetRegex.exec(html)) !== null && count < 5) {
                const text = match[1].replace(/<[^>]*>?/gm, '').trim();
                if (text) {
                    results.push(`* Result ${count + 1}: ${text}`);
                    count++;
                }
            }
        }
        
        if (results.length === 0) {
            return `No clear results found for: ${query}`;
        }
        
        const rawSnippets = results.join('\n');
        
        // Use Multi-Model Consensus if env is provided
        if (env) {
            const summaryPrompt = `
You are a Web Intelligence Analyst.
Analyze the following raw search snippets for the query: "${query}"
Extract the most critical and relevant information, synthesizing it into a cohesive summary.
Do not add information not present in the snippets.

--- SNIPPETS ---
${rawSnippets}
`;
            try {
                return await askMultipleAIWithConsensus(summaryPrompt, env, 3);
            } catch (e) {
                console.warn(`⚠️ [WebSearch] Consensus failed, returning raw snippets:`, e.message);
                return rawSnippets;
            }
        }
        
        return rawSnippets;
    } catch (err) {
        console.warn(`⚠️ [WebSearch] Error during search:`, err.message);
        return `Search failed for: ${query}`;
    }
}
