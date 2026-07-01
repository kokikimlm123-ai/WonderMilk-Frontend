const nutrientOrder = ['cp', 'ndf', 'adf', 'starch'];

function formatValue(value) {
  if (value === null || value === undefined) return '-';
  return typeof value === 'number' ? value.toFixed(2) : value;
}

export function FeedAnalyticsCard({ feedType, nutrients = [] }) {
  const nutrientMeta = new Map(nutrients.map((nutrient) => [nutrient.key, nutrient]));
  const visibleNutrients = nutrientOrder
    .map((key) => nutrientMeta.get(key))
    .filter(Boolean);

  return (
    <article className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 hover:shadow-md transition">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{feedType.feedType}</h3>
          <p className="text-sm text-gray-500 mt-1">{feedType.sampleCount} samples</p>
        </div>

        <div className="text-right">
          <p className="text-2xl font-bold text-blue-700">{feedType.percentage}%</p>
          <p className="text-xs uppercase text-gray-400">of total</p>
        </div>
      </div>

      <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 rounded-full"
          style={{ width: `${Math.min(feedType.percentage, 100)}%` }}
        />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        {visibleNutrients.map((nutrient) => {
          const value = feedType.averages?.[nutrient.key];

          return (
            <div key={nutrient.key} className="rounded-md bg-gray-50 px-3 py-2">
              <dt className="text-xs font-medium text-gray-500">{nutrient.label}</dt>
              <dd className="text-base font-semibold text-gray-900">
                {formatValue(value)}
                {value !== null && value !== undefined && (
                  <span className="text-xs font-medium text-gray-500 ml-1">{nutrient.unit}</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </article>
  );
}
