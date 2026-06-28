import { NextRequest } from "next/server";
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();
import { lookupTicker } from "@/lib/service/yahooFinance";

export const runtime = "nodejs";

async function prefetchYahooData(ticker: string) {
  try {
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: ["summaryDetail", "price", "financialData", "defaultKeyStatistics", "summaryProfile"],
    }) as any;

    const fd = summary.financialData || {};
    const ks = summary.defaultKeyStatistics || {};
    const sd = summary.summaryDetail || {};
    const sp = summary.summaryProfile || {};
    const pr = summary.price || {};

    const extractVal = (o: any) => {
      if (o === undefined || o === null) return null;
      if (typeof o === "object" && "raw" in o) return o.raw;
      return o;
    };

    return {
      symbol: ticker,
      longName: pr.longName || pr.shortName || ticker,
      marketCap: extractVal(sd.marketCap) || (extractVal(ks.sharesOutstanding) && extractVal(pr.regularMarketPrice) ? extractVal(ks.sharesOutstanding) * extractVal(pr.regularMarketPrice) : null),
      trailingPE: extractVal(sd.trailingPE) || null,
      forwardPE: extractVal(sd.forwardPE) || null,
      priceToBook: extractVal(ks.priceToBook) || null,
      regularMarketPrice: extractVal(pr.regularMarketPrice) || extractVal(fd.currentPrice) || null,
      freeCashflow: extractVal(fd.freeCashflow) || null,
      totalRevenue: extractVal(fd.totalRevenue) || null,
      debtToEquity: extractVal(fd.debtToEquity) || null,
      currentRatio: extractVal(fd.currentRatio) || null,
      quickRatio: extractVal(fd.quickRatio) || null,
      returnOnEquity: extractVal(fd.returnOnEquity) || null,
      returnOnAssets: extractVal(fd.returnOnAssets) || null,
      revenueGrowth: extractVal(fd.revenueGrowth) || null,
      profitMargins: extractVal(fd.profitMargins) || null,
      operatingMargins: extractVal(fd.operatingMargins) || extractVal(fd.operatingMargin) || null,
      grossMargins: extractVal(fd.grossMargins) || extractVal(fd.grossMargin) || null,
      website: sp.website || ks.website || null,
      fullTimeEmployees: sp.fullTimeEmployees || ks.fullTimeEmployees || null,
      sector: sp.sector || ks.sector || "Technology",
      industry: sp.industry || ks.industry || "Consumer Electronics",
      longBusinessSummary: sp.longBusinessSummary || ks.longBusinessSummary || "No business summary available.",
      exchange: pr.exchangeName || pr.exchange || "NASDAQ",
    };
  } catch (err) {
    console.error(`Error prefetching financials for ${ticker}:`, err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const companyName = body.companyName || "";
    const vectorStoreId = body.vectorStoreId || null;

    if (!companyName.trim()) {
      return new Response(JSON.stringify({ error: "Missing required body parameter: 'companyName'" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Resolve ticker on the frontend using yahoo-finance2
    let resolvedTicker = companyName;
    try {
      const resolved = await lookupTicker(companyName);
      if (resolved && resolved.ticker) {
        resolvedTicker = resolved.ticker;
      }
    } catch (err) {
      console.error("Fuzzy ticker lookup failed:", err);
    }

    // 2. Prefetch Yahoo Finance data from Vercel's rotating IPs
    const prefetchInfo = await prefetchYahooData(resolvedTicker);

    try {
      // Connect to hosted or local FastAPI Python server
      const modelServerUrl = process.env.MODEL_SERVER_URL || "http://localhost:8000";
      const response = await fetch(`${modelServerUrl}/predict/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company_name: resolvedTicker,
          vector_store_id: vectorStoreId,
          prefetch_info: prefetchInfo
        }),
      });

      if (!response.ok) {
        throw new Error(`Python server responded with status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response stream received from the Python server.");
      }

      // Proxy the SSE stream from the python backend directly to the browser
      return new Response(response.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
        },
      });
    } catch (fetchErr) {
      console.error("FastAPI server connection error:", fetchErr);
      
      // If Python server is unreachable, return a clear, user-friendly SSE stream error
      const responseStream = new TransformStream();
      const writer = responseStream.writable.getWriter();
      const encoder = new TextEncoder();
      
      const serverErrorMessage = "Model server not running — start it in your terminal with: ./start.sh or python -m investment_model.inference.server";

      (async () => {
        try {
          writer.write(encoder.encode(`data: ${JSON.stringify({ type: "error", error: serverErrorMessage })}\n\n`));
        } finally {
          writer.close();
        }
      })();

      return new Response(responseStream.readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
        },
      });
    }
  } catch (error: any) {
    console.error("Failed to parse POST body:", error);
    return new Response(JSON.stringify({ error: "Internal server error." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
