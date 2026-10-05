// Synthetic data, not customer records. Units shipped are equal in both periods,
// so the example separates absolute returns from return rates without confounding volume.
export const csv = `product,period,shipped,returned
Trail shoes,previous,200,8
Trail shoes,current,200,24
Rain jackets,previous,100,5
Rain jackets,current,100,9
Day packs,previous,150,3
Day packs,current,150,3
`;

export const load = `import csv, json
from collections import defaultdict
rows = list(csv.DictReader(open('returns.csv')))
products = defaultdict(dict)
for row in rows:
    products[row['product']][row['period']] = {k: int(row[k]) for k in ('shipped', 'returned')}
summary = [{'product': name, 'previous': p['previous']['returned'], 'current': p['current']['returned'], 'increase': p['current']['returned'] - p['previous']['returned']} for name, p in products.items()]
summary.sort(key=lambda row: row['increase'], reverse=True)
print(json.dumps(summary))`;

export const followup = `rates = [{'product': name, 'previous': round(100 * p['previous']['returned'] / p['previous']['shipped'], 2), 'current': round(100 * p['current']['returned'] / p['current']['shipped'], 2)} for name, p in products.items()]
print(json.dumps(rates))`;

export const questions = [
  'Which products account for the increase in returns?',
  'Could that just be higher sales? Compare return rates using the same data.',
];

export const expectedCounts = [
  { product: 'Trail shoes', previous: 8, current: 24, increase: 16 },
  { product: 'Rain jackets', previous: 5, current: 9, increase: 4 },
  { product: 'Day packs', previous: 3, current: 3, increase: 0 },
];
export const expectedRates = [
  { product: 'Trail shoes', previous: 4, current: 12 },
  { product: 'Rain jackets', previous: 5, current: 9 },
  { product: 'Day packs', previous: 2, current: 2 },
];
