import type { PenaltyDefinition } from '../types/models.ts';

export const PENALTY_DEFINITIONS: PenaltyDefinition[] = [
  {
    id: 'tripping',
    labelSv: 'Tripping',
    labelEn: 'Tripping',
    iconKey: 'tripping',
  },
  {
    id: 'slashing',
    labelSv: 'Slashing',
    labelEn: 'Slashing',
    iconKey: 'slashing',
  },
  {
    id: 'hooking',
    labelSv: 'Hooking',
    labelEn: 'Hooking',
    iconKey: 'hooking',
  },
  {
    id: 'holding',
    labelSv: 'Holding',
    labelEn: 'Holding',
    iconKey: 'holding',
  },
  {
    id: 'roughing',
    labelSv: 'Ruffing',
    labelEn: 'Roughing',
    iconKey: 'roughing',
  },
  {
    id: 'interference',
    labelSv: 'Interference',
    labelEn: 'Interference',
    iconKey: 'interference',
  },
  {
    id: 'high_sticking',
    labelSv: 'High-sticking',
    labelEn: 'High-sticking',
    iconKey: 'high_sticking',
  },
  {
    id: 'boarding',
    labelSv: 'Boarding',
    labelEn: 'Boarding',
    iconKey: 'boarding',
  },
  {
    id: 'cross_checking',
    labelSv: 'Cross-checking',
    labelEn: 'Cross-checking',
    iconKey: 'cross_checking',
  },
  {
    id: 'charging',
    labelSv: 'Charging',
    labelEn: 'Charging',
    iconKey: 'charging',
  },
  {
    id: 'checking_from_behind',
    labelSv: 'Checking from behind',
    labelEn: 'Checking from behind',
    iconKey: 'checking_from_behind',
  },
  {
    id: 'too_many_men',
    labelSv: 'För många spelare',
    labelEn: 'Too many men',
    iconKey: 'too_many_men',
  },
  {
    id: 'delay_of_game',
    labelSv: 'Delay of game',
    labelEn: 'Delay of game',
    iconKey: 'delay_of_game',
  },
];

export const PENALTY_DURATIONS = [
  '2 minuter',
  '2+2 minuter',
  '5 minuter',
  '10 minuter',
] as const;

export const DEFAULT_PENALTY_DURATION = '2 minuter';
