import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { samplesAPI, dashboardAPI } from '../lib/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';

export function Samples({ onOpenSample }) {
  const [selectedFeedType, setSelectedFeedType] = useState('');

  const {
    data: samples,
    loading,
    error,
    refetch
  } = useApi(
    () => samplesAPI.getAll(1, 50, selectedFeedType),
    [selectedFeedType]
  );

  const { data: feedTypes } = useApi(
    () => dashboardAPI.getFeedTypes(),
    []
  );

  if (loading) {
    return <LoadingSpinner message="Loading samples..." />;
  }

  if (error) {
    return (
      <ErrorMessage
        message={error}
        onRetry={refetch}
      />
    );
  }

  const results = samples?.results || [];
  const total = samples?.total || 0;

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Samples
        </h1>

        <p className="text-gray-500 mt-1">
          Total: {total} samples
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-4">
        <label className="block text-sm font-medium mb-2">
          Filter by Feed Type
        </label>

        <select
          value={selectedFeedType}
          onChange={(e) => setSelectedFeedType(e.target.value)}
          className="w-full border rounded-lg px-3 py-2"
        >
          <option value="">
            All Feed Types
          </option>

          {feedTypes?.data?.map((ft) => (
            <option
              key={ft.name}
              value={ft.name}
            >
              {ft.name}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-x-auto">
        <table className="w-full text-sm">

          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-3 text-left">ID</th>
              <th className="px-4 py-3 text-left">Product Name</th>
              <th className="px-4 py-3 text-left">ADF</th>
              <th className="px-4 py-3 text-left">NDF</th>
              <th className="px-4 py-3 text-left">CP</th>
              <th className="px-4 py-3 text-left">Analysis Time</th>
            </tr>
          </thead>

          <tbody>
            {results.length > 0 ? (
              results.map((row) => (
                <tr
                  key={row.id}
                  className="border-b hover:bg-blue-50 cursor-pointer"
                  onClick={() => onOpenSample(row.id)}
                >
                  <td className="px-4 py-2">
                    {row.id}
                  </td>

                  <td className="px-4 py-2">
                    {row.field_9063717 || '-'}
                  </td>

                  <td className="px-4 py-2">
                    {row.field_9063526 || '-'}
                  </td>

                  <td className="px-4 py-2">
                    {row.field_9063630 || '-'}
                  </td>

                  <td className="px-4 py-2">
                    {row.field_9063541 || '-'}
                  </td>

                  <td className="px-4 py-2">
                    {row.field_9063531 || '-'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="6"
                  className="px-4 py-6 text-center"
                >
                  No data found
                </td>
              </tr>
            )}
          </tbody>

        </table>
      </div>

    </div>
  );
}