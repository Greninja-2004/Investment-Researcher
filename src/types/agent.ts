export type InvestmentVerdict = "INVEST" | "PASS" | "UNCERTAIN";

export interface CompanyData {
  symbol: string | null;
  name: string;
  exchange: string;
  isPublic: boolean;
  sector?: string;
  industry?: string;
  description?: string;
  logo?: string;
  employees?: number;
  installedCapacity?: string;
}

export interface FinancialData {
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
  error?: string;
}

export interface NewsData {
  articlesCount: number;
  overallSentiment: "Bullish" | "Neutral" | "Bearish";
  sentimentScore: number; // 0 to 1
  summary: string;
  topNarratives: string[];
}

export interface CompetitorData {
  peers: string[];
  moatAnalysis: string;
  comparisonMatrix: Array<{
    metric: string;
    companyValue: string;
    peersAverage: string;
  }>;
}

export interface RiskData {
  regulatory: string[];
  financial: string[];
  market: string[];
  execution: string[];
}

export interface CustomModelDetails {
  numericalDrivers: Array<[string, number, number]>;
  textSignals: Array<[string, number]>;
  probabilities: Record<string, number>;
}

export interface AgentState {
  companyName: string;
  companyData: CompanyData | null;
  financialData: FinancialData | null;
  newsData: NewsData | null;
  competitorData: CompetitorData | null;
  riskData: RiskData | null;
  reasoning: string;
  verdict: InvestmentVerdict | null;
  confidence: number | null;
  bullCase: string[];
  bearCase: string[];
  keyRisks: string[];
  hasUploadedDocs: boolean;
  vectorStoreId: string | null;
  dataSourcesUsed: string[];
  logs: string[];
  customModelDetails?: CustomModelDetails;
}

export interface ResearchNode {
  name: string;
  status: "pending" | "active" | "completed" | "failed";
  label: string;
  description: string;
  duration?: number; // in ms
  summary?: string;
}

export interface StreamEvent {
  type: "start" | "node_start" | "node_complete" | "log" | "done" | "error";
  nodeName?: string;
  message?: string;
  data?: any;
  error?: string;
}
