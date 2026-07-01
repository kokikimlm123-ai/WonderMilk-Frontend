import { useState } from 'react';
import { samplesAPI } from '../lib/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';

export function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();

    if (!query.trim()) return;

    try {
      setLoading(true);
      setError(null);

      const response = await samplesAPI.search(query);

      setResults(response.results || []);
      setSearched(true);
    } catch (err) {
      setError(err.message || 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Search Samples
        </h1>

        <p className="text-gray-500 mt-1">
          Search Product Name, Feed Type or Farm Name
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg"
        />

        <button
          type="submit"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg"
        >
          Search
        </button>
      </form>

      {error && <ErrorMessage message={error} />}
      {loading && <LoadingSpinner message="Searching..." />}

      {searched && results.length > 0 && (
        <div className="bg-white rounded-lg shadow-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left">Product Name</th>
                <th className="px-4 py-3 text-left">Feed Type</th>
                <th className="px-4 py-3 text-left">Farm</th>
                <th className="px-4 py-3 text-left">CP</th>
                <th className="px-4 py-3 text-left">NDF</th>
                <th className="px-4 py-3 text-left">ADF</th>
                <th className="px-4 py-3 text-left">Starch</th>
              </tr>
            </thead>

            <tbody>
              {results.map((row, idx) => (
                <tr key={idx} className="border-b">
                  <td className="px-4 py-3">{row.field_9063548 || '-'}</td>
                  <td className="px-4 py-3">{row.field_9063717 || '-'}</td>
                  <td className="px-4 py-3">{row.field_9063962 || '-'}</td>
                  <td className="px-4 py-3">{row.field_9063541 || '-'}</td>
                  <td className="px-4 py-3">{row.field_9063630 || '-'}</td>
                  <td className="px-4 py-3">{row.field_9063526 || '-'}</td>
                  <td className="px-4 py-3">{row.field_9063724 || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {searched && results.length === 0 && !loading && (
        <div className="bg-blue-50 border rounded-lg p-8 text-center">
          No results found
        </div>
      )}

      {!searched && (
        <div className="bg-gray-50 border-2 border-dashed rounded-lg p-12 text-center">
          Enter a search query
        </div>
      )}
    </div>
  );
}