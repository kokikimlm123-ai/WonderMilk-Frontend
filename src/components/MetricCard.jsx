export function MetricCard({ title, value, unit = '', icon = 'Metric' }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500 hover:shadow-lg transition">
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-gray-600 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {value}
            {unit && <span className="text-lg text-gray-500 ml-1">{unit}</span>}
          </p>
        </div>
        <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
          {icon}
        </span>
      </div>
    </div>
  );
}
