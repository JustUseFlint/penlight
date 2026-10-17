export interface GlossaryEntry { term: string; definition: string; start?: number; inferred?: boolean; category?: string }
export interface GuidePoint { text: string; start?: number; mustKnow?: boolean }
export interface GuideSection { heading: string; start?: number; points: GuidePoint[]; terms: string[] }
export interface Guide {
  mode: 'lite' | 'ai';
  topic: string;
  overview: string;
  objectives: string[];
  sections: GuideSection[];
  glossary: GlossaryEntry[];
  mustKnow: GuidePoint[];
  nursingConsiderations: { title: string; items: string[] }[];
  mnemonics: { name: string; text: string }[];
  quickReview: string[];
  games: {
    tf: { statement: string; answer: boolean; explanation: string }[];
    sequences: { title: string; steps: string[] }[];
  };
  stats: { words: number; sentences: number; sections: number; terms: number };
  notes?: string[];
}
export interface GenCard { type: 'term' | 'qa' | 'cloze'; front: string; back: string; topic?: string; start?: number; mnemonic?: string }
export interface GenQuestion {
  type: 'mcq' | 'sata';
  stem: string;
  options: string[];
  correct: number[];
  rationale: string;
  topic: string;
  difficulty: number;
}
export interface StudyOutput { guide: Guide; cards: GenCard[]; questions: GenQuestion[] }

/** A question as served to / graded by the practice engine. */
export interface ServedQuestion {
  id: string;
  type: 'mcq' | 'sata' | 'numeric';
  exam: string;
  topic: string;
  stem: string;
  options: string[];
  correct: number[] | { answer: number; unit?: string; tol?: number };
  rationale: string;
  difficulty: number;
}
