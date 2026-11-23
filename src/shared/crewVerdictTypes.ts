import type { ArchetypeId, AxisResult, TierName } from './types';

export type CrewSyncTierId =
  | 'hostile_takeover'
  | 'different_planets'
  | 'somehow_a_crew'
  | 'unlikely_alliance'
  | 'one_braincell'
  | 'mind_meld'
  | 'literally_same_person';

export interface CrewSyncTierDef {
  id: CrewSyncTierId;
  minSync: number;
  maxSync: number;
  title: string;
  shortDesc: string;
  crewDiagnosis: string;
  tone: string;
  badgeColor: string;
  accentGlow: string;
  verdictLines: string[];
}

export type PairRelationshipTierId =
  | 'natural_enemies'
  | 'unresolved_tension'
  | 'acquaintances_at_best'
  | 'decent_chemistry'
  | 'same_wavelength'
  | 'shared_braincell'
  | 'suspicious_connection';

export interface PairRelationshipTierDef {
  id: PairRelationshipTierId;
  minSync: number;
  maxSync: number;
  label: string;
  lines: string[];
}

export type IndividualLabelId =
  | 'crew_glue'
  | 'the_outsider'
  | 'the_wildcard'
  | 'the_diplomat'
  | 'the_chaos_engine'
  | 'the_human_mirror'
  | 'the_voice_of_reason'
  | 'the_unpredictable_one';

export interface IndividualLabelDef {
  id: IndividualLabelId;
  title: string;
  description: string;
}

export type CrewAwardId =
  | 'the_human_mirror'
  | 'walking_red_flag'
  | 'the_voice_of_reason'
  | 'the_main_character'
  | 'the_diplomat'
  | 'the_wildcard'
  | 'the_clone'
  | 'the_contrarian'
  | 'the_therapist'
  | 'the_instigator'
  | 'the_lone_wolf'
  | 'the_glue';

export interface CrewAwardDef {
  id: CrewAwardId;
  title: string;
  icon: string;
  tagline: string;
  description: string;
  isShareable?: boolean;
}

export interface PlayerVerdictAnalysis {
  memberId: string;
  nickname: string;
  isMe: boolean;
  archetypeId: ArchetypeId;
  archetypeName: string;
  axisResult: AxisResult;
  averagePairSync: number; // 0..100
  strongestPartner?: {
    memberId: string;
    nickname: string;
    percentage: number;
  };
  weakestPartner?: {
    memberId: string;
    nickname: string;
    percentage: number;
  };
  individualLabel: {
    id: IndividualLabelId;
    title: string;
    description: string;
  };
  roast: string;
  compliment: string;
  observation: string;
  awardsReceived: {
    id: CrewAwardId;
    title: string;
    icon: string;
    explanation: string;
  }[];
  distanceFromCrewMean: number;
  loneChoiceCount: number;
  extremeAnswerCount: number;
  majorityDisagreementCount: number;
}

export interface PairwiseRelationshipAnalysis {
  memberAId: string;
  memberAName: string;
  memberBId: string;
  memberBName: string;
  matches: number;
  total: number;
  percentage: number;
  tierId: PairRelationshipTierId;
  tierLabel: string;
  commentary: string;
}

export interface AxisDynamicDetail {
  axis: 'plan_chaos' | 'solo_crew' | 'logic_instinct';
  axisName: string;
  leftPole: string;
  rightPole: string;
  leftCount: number;
  rightCount: number;
  crewAverageRaw: number; // e.g. -14..+14
  crewAverageSlider: number; // 0..100
  dominantPole: string;
  consensusScore: number; // 0 (50/50 split) to 100 (unanimous)
  commentary: string;
  outlierMembers: string[];
}

export interface CrewPersonalityDynamics {
  dominantCrewArchetype: {
    id: ArchetypeId;
    name: string;
    count: number;
    description: string;
  };
  axes: {
    plan_chaos: AxisDynamicDetail;
    solo_crew: AxisDynamicDetail;
    logic_instinct: AxisDynamicDetail;
  };
  strongestAgreement: {
    axisName: string;
    pole: string;
    description: string;
  } | null;
  biggestDisagreement: {
    axisName: string;
    splitDescription: string;
    description: string;
  } | null;
  crewArchetypeDistribution: Record<ArchetypeId, number>;
}

export interface CrewAwardWinner {
  awardId: CrewAwardId;
  title: string;
  icon: string;
  winnerMemberIds: string[];
  winnerNicknames: string[];
  explanation: string;
}

export interface CompleteCrewVerdict {
  syncPercent: number;
  tier: {
    id: CrewSyncTierId;
    title: string;
    shortDesc: string;
    crewDiagnosis: string;
    verdictLine: string;
    tone: string;
    badgeColor: string;
    accentGlow: string;
  };
  finalCrewRoast: string;
  personalityDynamics: CrewPersonalityDynamics;
  playerAnalyses: PlayerVerdictAnalysis[];
  pairwiseRelationships: PairwiseRelationshipAnalysis[];
  awards: CrewAwardWinner[];
}
