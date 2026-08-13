import { mslq } from './mslq';
import { tam } from './tam';
import { tamReal } from './tam_real';

export const exampleDatasets = [tamReal, mslq, tam];

// Turn an example dataset into the app's working state shape.
export function datasetToState(ds) {
  return {
    source: `example:${ds.id}`,
    name: ds.name,
    columns: ds.columns,
    rows: ds.rows,
    points: ds.points,
    labels: ds.labels.slice(),
    valueMap: null,
    likertColumns: ds.likertColumns.slice(),
    subscales: ds.subscales.map((s) => ({ name: s.name, columns: s.columns.slice() })),
    groupingColumns: ds.groupingColumns.slice(),
    groupBy: ds.defaultGroupBy || null,
  };
}
