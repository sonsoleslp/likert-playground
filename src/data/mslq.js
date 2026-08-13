import { generateDataset } from './generate';

// MSLQ — Motivated Strategies for Learning Questionnaire (motivation section).
// Synthetic data. 7-point scale (1 = not at all true of me .. 7 = very true).
const spec = {
  seed: 20240711,
  n: 220,
  points: 7,
  groupingColumns: [
    {
      name: 'Gender',
      levels: [{ value: 'Female' }, { value: 'Male' }, { value: 'Non-binary' }],
    },
    {
      name: 'Course',
      levels: [{ value: 'Biology' }, { value: 'Physics' }, { value: 'Psychology' }],
    },
    {
      name: 'Year',
      levels: [{ value: '1st' }, { value: '2nd' }, { value: '3rd' }],
    },
  ],
  subscales: [
    {
      name: 'Intrinsic Goal Orientation',
      prefix: 'IGO',
      count: 4,
      base: 5.2,
      groupEffects: { Course: { Biology: 0.3, Psychology: 0.2, Physics: -0.2 } },
    },
    {
      name: 'Extrinsic Goal Orientation',
      prefix: 'EGO',
      count: 4,
      base: 4.6,
      groupEffects: { Course: { Physics: 0.4, Biology: -0.1 } },
    },
    {
      name: 'Task Value',
      prefix: 'TV',
      count: 6,
      base: 5.4,
      groupEffects: { Year: { '3rd': 0.4, '1st': -0.3 } },
    },
    {
      name: 'Control of Learning Beliefs',
      prefix: 'CLB',
      count: 4,
      base: 5.0,
    },
    {
      name: 'Self-Efficacy',
      prefix: 'SE',
      count: 8,
      base: 5.1,
      groupEffects: { Gender: { Male: 0.35, 'Non-binary': -0.1 }, Year: { '3rd': 0.5 } },
    },
    {
      name: 'Test Anxiety',
      prefix: 'TA',
      count: 5,
      base: 4.0,
      groupEffects: { Gender: { Female: 0.5, 'Non-binary': 0.4 }, Year: { '1st': 0.4 } },
    },
  ],
};

const generated = generateDataset(spec);

export const mslq = {
  id: 'mslq',
  name: 'MSLQ (motivation)',
  description:
    'Motivated Strategies for Learning Questionnaire — motivation scales. Synthetic, 7-point, N=220.',
  info: {
    synthetic: true,
    context:
      'The MSLQ (Pintrich, Smith, Garcia & McKeachie, 1991) is a widely used self-report instrument measuring college students’ motivation and learning strategies. This example covers the six motivation subscales — Intrinsic and Extrinsic Goal Orientation, Task Value, Control of Learning Beliefs, Self-Efficacy, and Test Anxiety — on a 7-point scale (1 = not at all true of me … 7 = very true of me). Responses here are SYNTHETIC, generated with modest between-group differences (by course, gender and year) so you have something realistic to plot. It is not real survey data.',
    sourceUrl: 'https://eric.ed.gov/?id=ED338122',
    sourceLabel: 'MSLQ manual (Pintrich et al., 1991) — ERIC ED338122',
    license: 'Synthetic demo data (generated for this app)',
    citation:
      'Instrument: Pintrich, P.R., Smith, D.A.F., Garcia, T., McKeachie, W.J. (1991). A Manual for the Use of the Motivated Strategies for Learning Questionnaire (MSLQ).',
  },
  points: 7,
  labels: [
    'Not at all true',
    '2',
    '3',
    'Somewhat true',
    '5',
    '6',
    'Very true of me',
  ],
  groupingColumns: ['Gender', 'Course', 'Year'],
  defaultGroupBy: 'Course',
  ...generated,
};
