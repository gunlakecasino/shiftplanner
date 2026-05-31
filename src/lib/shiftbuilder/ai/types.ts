/**
 * Training & Analysis types for the Engine AI Lab.
 * These power the "Grok proposes → human corrects with rationale → engine learns" loop.
 */

export interface HumanFeedback {
  id: string;
  scenarioId: string;           // night id or sim batch id
  dayName: string;
  correction: string;           // "I would have done X instead of Y because..."
  rationale?: string;           // optional extra why
  confidence?: number;          // 0-1 how sure the operator is
  timestamp: string;
}

export interface TrainingExample {
  id: string;
  source: "real" | "simulation";
  dayName: string;
  inputSnapshot: any;           // compact roster + assignments + config at time of analysis
  grokAnalysis: any;            // the DayAnalysisResult
  humanFeedback?: HumanFeedback;
  outcomeAfterFeedback?: any;   // what actually happened after correction applied
  createdAt: string;
}

export type EngineAnalysis = {
  id: string;
  dayName: string;
  timestamp: string;
  unfilled: number;
  mode: string;
  tokens: number;
  suggestions: any[];
  grokRationale?: string;
  rawResponse?: string;
};
