import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();

export interface CompanyFinancials {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  peRatio: number | null;
  forwardPe: number | null;
  priceToBook: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  roe: number | null;
  operatingMargin: number | null;
  profitMargin: number | null;
  freeCashFlow: number | null;
  revenueGrowth: number | null;
  currency: string;
}

export async function lookupTicker(companyName: string): Promise<{ ticker: string; exchange: string; isPublic: boolean; name: string } | null> {
  try {
    const results = (await yahooFinance.search(companyName, { newsCount: 0 })) as any;
    if (results && results.quotes && results.quotes.length > 0) {
      // Find the first equity or depositary receipt type quote
      const validQuote = results.quotes.find(
        (q: any) => q.quoteType === "EQUITY" || q.quoteType === "ETF" || q.quoteType === "MUTUALFUND"
      ) || results.quotes[0];

      if (validQuote && validQuote.symbol) {
        return {
          ticker: validQuote.symbol,
          exchange: validQuote.exchange || "Unknown",
          isPublic: validQuote.quoteType === "EQUITY" || validQuote.quoteType === "ETF",
          name: validQuote.longname || validQuote.shortname || companyName,
        };
      }
    }
    return null;
  } catch (error) {
    console.error("Error looking up ticker:", error);
    return null;
  }
}

export async function fetchCompanyFinancials(ticker: string): Promise<CompanyFinancials | null> {
  try {
    const quoteSummary = (await yahooFinance.quoteSummary(ticker, {
      modules: ["summaryDetail", "price", "financialData", "defaultKeyStatistics"],
    })) as any;

    const summaryDetail = quoteSummary.summaryDetail || {};
    const price = quoteSummary.price || {};
    const financialData = quoteSummary.financialData || {};
    const defaultKeyStatistics = quoteSummary.defaultKeyStatistics || {};

    const extractNumber = (val: any): number | null => {
      if (val === undefined || val === null) return null;
      if (typeof val === "object" && "raw" in val) return val.raw;
      if (typeof val === "number") return val;
      return null;
    };

    const marketCapVal = extractNumber(summaryDetail.marketCap) || 
      (extractNumber(defaultKeyStatistics.sharesOutstanding) || 0) * (extractNumber(price.regularMarketPrice) || 0) || 0;

    return {
      symbol: ticker,
      name: price.longName || price.shortName || ticker,
      price: extractNumber(price.regularMarketPrice) || extractNumber(financialData.currentPrice) || 0,
      marketCap: marketCapVal,
      peRatio: extractNumber(summaryDetail.trailingPE) || null,
      forwardPe: extractNumber(summaryDetail.forwardPE) || null,
      priceToBook: extractNumber(defaultKeyStatistics.priceToBook) || null,
      debtToEquity: extractNumber(financialData.debtToEquity) || null,
      currentRatio: extractNumber(financialData.currentRatio) || null,
      roe: extractNumber(financialData.returnOnEquity) || null,
      operatingMargin: extractNumber(financialData.operatingMargins) || null,
      profitMargin: extractNumber(financialData.profitMargins) || null,
      freeCashFlow: extractNumber(financialData.freeCashflow) || null,
      revenueGrowth: extractNumber(financialData.revenueGrowth) || null,
      currency: price.currency || "USD",
    };
  } catch (error) {
    console.error(`Error fetching financials for ticker ${ticker}:`, error);
    return null;
  }
}
