import { generateDataset } from './generate';

// TAM — Technology Acceptance Model.
// Synthetic data. 7-point scale (1 = strongly disagree .. 7 = strongly agree).
const spec = {
  seed: 19981204,
  n: 180,
  points: 7,
  groupingColumns: [
    {
      name: 'Condition',
      levels: [{ value: 'New UI' }, { value: 'Legacy UI' }],
    },
    {
      name: 'Experience',
      levels: [{ value: 'Novice' }, { value: 'Intermediate' }, { value: 'Expert' }],
    },
    {
      name: 'AgeGroup',
      levels: [{ value: '18-29' }, { value: '30-44' }, { value: '45+' }],
    },
  ],
  subscales: [
    {
      name: 'Perceived Usefulness',
      prefix: 'PU',
      count: 4,
      base: 5.3,
      groupEffects: { Condition: { 'New UI': 0.6, 'Legacy UI': -0.3 } },
    },
    {
      name: 'Perceived Ease of Use',
      prefix: 'PEOU',
      count: 4,
      base: 5.0,
      groupEffects: {
        Condition: { 'New UI': 0.8, 'Legacy UI': -0.4 },
        Experience: { Expert: 0.5, Novice: -0.4 },
      },
    },
    {
      name: 'Attitude Toward Use',
      prefix: 'ATT',
      count: 3,
      base: 5.1,
      groupEffects: { Condition: { 'New UI': 0.5 } },
    },
    {
      name: 'Behavioral Intention',
      prefix: 'BI',
      count: 3,
      base: 4.9,
      groupEffects: {
        Condition: { 'New UI': 0.7, 'Legacy UI': -0.4 },
        AgeGroup: { '45+': -0.3, '18-29': 0.2 },
      },
    },
  ],
};

const generated = generateDataset(spec);

export const tam = {
  id: 'tam',
  name: 'TAM (technology acceptance)',
  description:
    'Technology Acceptance Model — usefulness, ease of use, attitude, intention. Synthetic, 7-point, N=180.',
  info: {
    synthetic: true,
    context:
      'The Technology Acceptance Model (Davis, 1989) explains why people adopt a technology: Perceived Usefulness and Perceived Ease of Use drive Attitude Toward Use and ultimately Behavioral Intention. This example lays out those four subscales on a 7-point agreement scale (1 = strongly disagree … 7 = strongly agree), with a between-subjects Condition (New UI vs. Legacy UI) plus experience and age-group grouping variables. Responses are SYNTHETIC, generated with plausible group effects — not real data. For a real TAM dataset, load “TAM — e-book readers”.',
    sourceUrl: 'https://doi.org/10.2307/249008',
    sourceLabel: 'Davis (1989), MIS Quarterly 13(3)',
    license: 'Synthetic demo data (generated for this app)',
    citation:
      'Instrument: Davis, F.D. (1989). Perceived Usefulness, Perceived Ease of Use, and User Acceptance of Information Technology. MIS Quarterly 13(3), 319–340.',
  },
  points: 7,
  labels: [
    'Strongly disagree',
    'Disagree',
    'Somewhat disagree',
    'Neutral',
    'Somewhat agree',
    'Agree',
    'Strongly agree',
  ],
  groupingColumns: ['Condition', 'Experience', 'AgeGroup'],
  defaultGroupBy: 'Condition',
  ...generated,
};
