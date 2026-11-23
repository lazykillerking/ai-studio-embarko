import type { CompleteCrewVerdict } from './crewVerdictTypes';

export type PackId =
  | 'the_mix'
  | 'everyday_life'
  | 'social_circuit'
  | 'neon_coast'
  | 'campus_chaos'
  | 'leonida_vibe'
  | 'pop_culture'
  | 'moral_mayhem';

export type VisualTheme =
  | 'the_mix'
  | 'everyday_life'
  | 'social_circuit'
  | 'neon_coast'
  | 'campus_chaos'
  | 'leonida_vibe'
  | 'pop_culture'
  | 'moral_mayhem';

export type ArchetypeId =
  | 'the_architect'
  | 'the_lone_oracle'
  | 'the_dispatcher'
  | 'the_anchor'
  | 'the_rogue_tactician'
  | 'the_free_agent'
  | 'the_plot_twister'
  | 'the_spark';

export type TierName =
  | 'PROVISIONAL'
  | 'FAMILIAR'
  | 'UNUSUAL'
  | 'OUTLIER'
  | 'WILDCARD';

export type SampleGate = 'FIRST_WAVE' | 'EARLY_SIGNAL' | 'FULL';
export type RarityBand = 'low' | 'mid' | 'high';

export interface QuestionOption {
  text: string;
  axes: [number, number, number]; // [plan_chaos, solo_crew, logic_instinct]
}

export interface QuestionRecord {
  id: string;
  pack_id: PackId;
  prompt: string;
  options: [QuestionOption, QuestionOption, QuestionOption, QuestionOption];
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  status: 'published' | 'draft';
  version: number;
}

export interface PublicQuestion {
  id: string;
  pack_id: PackId;
  prompt: string;
  options: { text: string }[];
}

export interface PackSummary {
  id: PackId;
  slug: string;
  name: string;
  description: string;
  visual_theme: VisualTheme;
  sort_order: number;
  questionCount: number;
  todayStatus: {
    date: string;
    answeredCount: number;
    completed: boolean;
    totalPoints: number | null;
    archetypeId: ArchetypeId | null;
    scoreTitle: string | null;
  };
}

export interface AnswerRecord {
  question_id: string;
  option_index: number;
  tier: TierName;
  points: number;
  sample_size_at_answer: number;
  scoring_version: number;
  overthinker?: boolean;
}

export interface StatRevealPayload {
  questionId: string;
  optionIndex: number;
  tier: TierName;
  tierColor: string;
  points: number;
  gate: SampleGate;
  sampleSize: number;
  statusLine: string;
  oneLiner: string;
  showPercentages: boolean;
  bars: {
    optionIndex: number;
    text: string;
    votes: number;
    percentage: number | null;
    approxRatio: number;
    isChosen: boolean;
  }[];
}

export interface AxisResult {
  raw: [number, number, number];
  sliders: [number, number, number]; // 0..100
  poles: ['PLAN' | 'CHAOS', 'SOLO' | 'CREW', 'LOGIC' | 'INSTINCT'];
  archetypeId: ArchetypeId;
}

export interface VerdictEntry {
  id: string;
  headlineStamp: string;
  heat: number; // 1..5
  compliment: string;
  roast: string;
}

export interface QuestionBreakdownOption {
  optionIndex: number;
  text: string;
  points: number;
  tier: TierName;
  tierColor: string;
  percentage: number | null;
  votes: number;
  isChosen: boolean;
}

export interface QuestionBreakdownItem {
  questionId: string;
  prompt: string;
  chosenIndex: number;
  chosenPoints: number;
  chosenTier: TierName;
  options: QuestionBreakdownOption[];
}

export interface SoloFinalResult {
  packId: PackId;
  challengeDate: string;
  totalPoints: number;
  scoreTitle: string;
  scoringVersion: number;
  axisResult: AxisResult;
  archetype: {
    id: ArchetypeId;
    name: string;
    oneLineTrait: string;
  };
  verdict: VerdictEntry;
  packLine: string | null;
  answerRecords: AnswerRecord[];
  questionBreakdown?: QuestionBreakdownItem[];
}

export interface SoloDailyResponse {
  pack: {
    id: PackId;
    name: string;
    description: string;
    visual_theme: VisualTheme;
  };
  date: string;
  nextResetIso: string;
  launchSetMode: boolean;
  questions: PublicQuestion[];
  answerRecords: AnswerRecord[];
  completed: boolean;
  finalResult: SoloFinalResult | null;
}

export interface CrewMemberPublic {
  memberId: string;
  nickname: string;
  completed: boolean;
  isMe: boolean;
}

export interface CrewQuestionBreakdown {
  questionId: string;
  prompt: string;
  agreementPercent: number;
  isPerfectSync: boolean;
  options: {
    optionIndex: number;
    text: string;
    voters: { memberId: string; nickname: string; isMe: boolean }[];
    count: number;
  }[];
}

export interface CrewPairScore {
  memberAId: string;
  memberAName: string;
  memberBId: string;
  memberBName: string;
  matches: number;
  total: number;
  percentage: number;
}

export interface CrewBoardPayload {
  completedCount: number;
  crewSyncPercent: number;
  roast: {
    title: string;
    line: string;
  };
  members: {
    memberId: string;
    nickname: string;
    isMe: boolean;
    totalScore: number;
    maxScore: number;
    perQuestionScores: number[];
    loneCount: number;
  }[];
  pairwise: CrewPairScore[];
  questionBreakdowns: CrewQuestionBreakdown[];
  // k = 2 summary
  twoPlayerSummary: {
    perfectSyncQuestions: { index: number; prompt: string; chosenText: string }[];
    splitDecisionQuestions: {
      index: number;
      prompt: string;
      choices: { nickname: string; text: string }[];
    }[];
  } | null;
  // k >= 3 awards
  awards: {
    mindTwins: {
      matches: number;
      percentage: number;
      pairs: { memberAName: string; memberBName: string }[];
    } | null;
    commonGround: {
      questionIndex: number;
      prompt: string;
      agreementPercent: number;
      isPerfectSync: boolean;
    } | null;
    civilWar: {
      questionIndex: number;
      prompt: string;
      agreementPercent: number;
    } | null;
    loneSignal: {
      nickname: string;
      loneCount: number;
    } | null;
  } | null;
  verdict?: CompleteCrewVerdict | null;
}

export interface CrewStateResponse {
  crew: {
    id: string;
    code: string;
    name: string;
    packId: PackId | null;
    mode: 'themed' | 'mixed';
    visualTheme: VisualTheme;
    maxPlayers: number;
    memberCount: number;
    completedCount: number;
    isFull: boolean;
    invitePath: string;
    createdAt: string;
    questions?: PublicQuestion[];
    completed?: boolean;
  };
  completed?: boolean;
  memberCount?: number;
  completedCount?: number;
  me: {
    joined: boolean;
    nickname: string;
    answers: Record<string, number>;
    answeredCount: number;
    completed: boolean;
  };
  members: CrewMemberPublic[];
  questions: PublicQuestion[];
  // Strictly null until THIS device has completed all 7 AND completedCount >= 2
  board: CrewBoardPayload | null;
}
