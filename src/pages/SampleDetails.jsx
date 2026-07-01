import { useState, useEffect, useMemo } from 'react';
import { samplesAPI } from '../lib/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { FIELD_NAMES } from '../constants/fieldMap';

export function SampleDetails({ sampleId: initialSampleId }) {
  const [sampleId, setSampleId] = useState(initialSampleId || '');
  const [sample, setSample] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');

const getCategory = (fieldName) => {
if (fieldName.startsWith('Global H')) return 'global';
if (fieldName.startsWith('t-statistics')) return 'stats';

const nutrients = [
'CP',
'ADF',
'NDF',
'ASH',
'FAT',
'STARCH',
'SUGAR',
'WSC'
];

const minerals = [
'CA',
'P',
'MG',
'K',
'NA',
'S',
'CL',
'FE'
];

const fatty = [
'C12_0',
'C16_0',
'C18_0',
'C18_1',
'C18_2',
'C18_3'
];

if (nutrients.includes(fieldName)) return 'nutrient';
if (minerals.includes(fieldName)) return 'mineral';
if (fatty.includes(fieldName)) return 'fatty';

return 'other';
};


  const loadSample = async (id = sampleId) => {
    if (!id) return;

    try {
      setLoading(true);

      const response = await samplesAPI.getById(id);

      setSample(response.data || response);
    } catch (error) {
      console.error(error);
      alert('Sample not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialSampleId) {
      setSampleId(initialSampleId);
      loadSample(initialSampleId);
    }
  }, [initialSampleId]);

const filteredFields = useMemo(() => {
  if (!sample) return [];

  return Object.entries(sample)
    .filter(([key, value]) => {
      if (value === null || value === '') return false;

      const fieldName = FIELD_NAMES[key] || key;

      const matchesSearch =
  fieldName.toLowerCase().includes(searchTerm.toLowerCase()) ||
  String(value).toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      if (activeTab === 'all') return true;

      return getCategory(fieldName) === activeTab;
    })
    .sort(([a], [b]) =>
      (FIELD_NAMES[a] || a).localeCompare(
        FIELD_NAMES[b] || b
      )
    );
}, [sample, searchTerm, activeTab]);
const feedQualityScore = Math.round(
(
  Number(sample?.field_9063541 || 0) * 0.30 + // CP
  Number(sample?.field_9063724 || 0) * 0.25 + // STARCH
  Number(sample?.field_9063545 || 0) * 0.20 + // FAT
  Number(sample?.field_9063630 || 0) * 0.15 + // NDF
  Number(sample?.field_9063526 || 0) * 0.10   // ADF
) / 2
);
const counts = {
  nutrient: Object.entries(sample || {}).filter(([key]) =>
    getCategory(FIELD_NAMES[key] || key) === 'nutrient'
  ).length,

  mineral: Object.entries(sample || {}).filter(([key]) =>
    getCategory(FIELD_NAMES[key] || key) === 'mineral'
  ).length,

  fatty: Object.entries(sample || {}).filter(([key]) =>
    getCategory(FIELD_NAMES[key] || key) === 'fatty'
  ).length,

  global: Object.entries(sample || {}).filter(([key]) =>
    getCategory(FIELD_NAMES[key] || key) === 'global'
  ).length,

  stats: Object.entries(sample || {}).filter(([key]) =>
    getCategory(FIELD_NAMES[key] || key) === 'stats'
  ).length
};


  if (loading) {
    return (
      <LoadingSpinner message="Loading sample..." />
    );
  }

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Sample Details
        </h1>

        <p className="text-gray-500 mt-1">
          View all available fields
        </p>
      </div>

      <div className="bg-white p-4 rounded-lg shadow flex gap-3">
        <input
  type="text"
  value={sampleId}
          onChange={(e) => setSampleId(e.target.value)}
          placeholder="Enter Sample ID"
          className="border px-4 py-2 rounded flex-1"
        />

        <button
          onClick={() => loadSample()}
          className="bg-blue-600 text-white px-5 py-2 rounded"
        >
          Load Sample
        </button>
      </div>

      {sample && (
        <>
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-2xl font-bold">
              {sample.field_9063717 || 'Unknown Sample'}
            </h2>

            <p className="text-gray-500">
              {sample.field_9063531 || ''}
            </p>

            <p className="text-sm text-gray-400 mt-2">
              Sample ID: {sample.id}
            </p>
<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">

  <div>
  <p className="text-gray-500 text-sm">Product Name</p>
  <p className="font-semibold">
    {sample.field_9063717 || '-'}
  </p>
</div>

  <div>
  <p className="text-gray-500 text-sm">Sample Name</p>
  <p className="font-semibold">
    {sample.field_9063728 || '-'}
  </p>
</div>

  <div>
    <p className="text-gray-500 text-sm">Feed Type</p>
    <p className="font-semibold">
      {sample.field_9063548 || '-'}
    </p>
  </div>

  <div>
  <p className="text-gray-500 text-sm">Land Operator</p>
  <p className="font-semibold">
    {sample.field_9063961 || '-'}
  </p>
</div>

</div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">

            <div className="bg-blue-50 p-4 rounded-lg shadow">
              <p className="text-sm text-gray-500">ADF</p>
              <p className="text-2xl font-bold">
                {sample.field_9063526 || '-'}
              </p>
            </div>

            <div className="bg-green-50 p-4 rounded-lg shadow">
              <p className="text-sm text-gray-500">NDF</p>
              <p className="text-2xl font-bold">
                {sample.field_9063630 || '-'}
              </p>
            </div>

            <div className="bg-yellow-50 p-4 rounded-lg shadow">
              <p className="text-sm text-gray-500">CP</p>
              <p className="text-2xl font-bold">
                {sample.field_9063541 || '-'}
              </p>
            </div>

            <div className="bg-red-50 p-4 rounded-lg shadow">
              <p className="text-sm text-gray-500">FAT</p>
              <p className="text-2xl font-bold">
                {sample.field_9063545 || '-'}
              </p>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg shadow">
              <p className="text-sm text-gray-500">STARCH</p>
              <p className="text-2xl font-bold">
                {sample.field_9063724 || '-'}
              </p>
            </div>

                    </div>
<div className="bg-white rounded-xl shadow p-6">
  <h3 className="text-xl font-bold mb-4">
    Feed Quality Score
  </h3>

  <div className="flex items-center gap-6">

    <div className="text-6xl font-bold text-blue-600">
      {feedQualityScore}
    </div>

    <div>
      <p className="text-lg font-semibold">
        {feedQualityScore >= 80
          ? '🟢 Excellent'
          : feedQualityScore >= 60
          ? '🟡 Good'
          : '🔴 Low Quality'}
      </p>

      <p className="text-gray-500">
        Based on CP, Starch, Fat, NDF and ADF
      </p>
    </div>

  </div>
</div>

{/* Calibration Quality Check */}

<div className="bg-white rounded-xl shadow p-6">
  <h3 className="text-xl font-bold mb-4">
    Calibration Quality Check
  </h3>

  <table className="w-full text-sm">
    <thead>
      <tr className="bg-gray-100">
        <th className="p-2 text-left">Parameter</th>
        <th className="p-2 text-center">Actual</th>
        <th className="p-2 text-center">Global H</th>
        <th className="p-2 text-center">Difference</th>
      </tr>
    </thead>

    <tbody>
      <tr>
        <td className="p-2">CP</td>
        <td className="text-center">{sample.field_9063541}</td>
        <td className="text-center">{sample.field_9063564}</td>
        <td className="text-center">
          {(
            Number(sample.field_9063541 || 0) -
            Number(sample.field_9063564 || 0)
          ).toFixed(2)}
        </td>
      </tr>
    </tbody>
  </table>
</div>

          <div className="bg-white p-4 rounded-lg shadow">
            <input
              type="text"
              placeholder="Search field name or value..."
              value={searchTerm}
              onChange={(e) =>
                setSearchTerm(e.target.value)
              }
              className="w-full border px-4 py-2 rounded-lg"
            />
          </div>
<div className="bg-white p-4 rounded-lg shadow">
  <div className="flex flex-wrap gap-2">

    <button
  onClick={() => setActiveTab('all')}
  className={`px-3 py-2 rounded ${
  activeTab === 'all'
    ? 'bg-blue-600 text-white'
    : 'bg-gray-200 text-gray-700'
}`}
>
  All Fields ({filteredFields.length})
</button>

    <button
  onClick={() => setActiveTab('nutrient')}
  className={`px-3 py-2 rounded ${
    activeTab === 'nutrient'
      ? 'bg-green-600 text-white'
      : 'bg-gray-200 text-gray-700'
  }`}
>
  Nutrients ({counts.nutrient})
</button>

    <button
  onClick={() => setActiveTab('mineral')}
  className={`px-3 py-2 rounded ${
    activeTab === 'mineral'
      ? 'bg-yellow-600 text-white'
      : 'bg-gray-200 text-gray-700'
}`}
>
      Minerals ({counts.mineral})
    </button>

    <button
  onClick={() => setActiveTab('fatty')}
  className={`px-3 py-2 rounded ${
    activeTab === 'fatty'
      ? 'bg-purple-600 text-white'
      : 'bg-gray-200 text-gray-700'
  }`}
>
  Fatty Acids ({counts.fatty})
</button>

    <button
  onClick={() => setActiveTab('global')}
  className={`px-3 py-2 rounded ${
    activeTab === 'global'
      ? 'bg-red-600 text-white'
      : 'bg-gray-200 text-gray-700'
  }`}
>
  Global H ({counts.global})
</button>

    <button
  onClick={() => setActiveTab('stats')}
  className={`px-3 py-2 rounded ${
    activeTab === 'stats'
      ? 'bg-gray-700 text-white'
      : 'bg-gray-200 text-gray-700'
  }`}
>
  T-Statistics ({counts.stats})
</button>

  </div>
</div>

<div className="grid grid-cols-1 md:grid-cols-3 gap-6">

  {/* Nutrients */}
  <div className="bg-green-50 rounded-xl p-5 shadow">
    <h3 className="text-lg font-bold text-green-700 mb-4">
      Nutrients
    </h3>

    <div className="space-y-2">
      <div className="flex justify-between">
        <span>CP</span>
        <span>{sample.field_9063541 || '-'}</span>
      </div>

      <div className="flex justify-between">
        <span>ADF</span>
        <span>{sample.field_9063526 || '-'}</span>
      </div>

      <div className="flex justify-between">
        <span>NDF</span>
        <span>{sample.field_9063630 || '-'}</span>
      </div>

      <div className="flex justify-between">
        <span>Starch</span>
        <span>{sample.field_9063724 || '-'}</span>
      </div>

      <div className="flex justify-between">
        <span>Fat</span>
        <span>{sample.field_9063545 || '-'}</span>
      </div>
    </div>
  </div>

  {/* Minerals */}
  <div className="bg-yellow-50 rounded-xl p-5 shadow">
    <h3 className="text-lg font-bold text-yellow-700 mb-4">
      Minerals
    </h3>

    <div className="space-y-2">
      <div className="flex justify-between">
        <span>Ca</span>
        <span>{sample.field_9063538 || '-'}</span>
      </div>

      <div className="flex justify-between">
        <span>P</span>
        <span>{sample.field_9063665 || '-'}</span>
      </div>

      <div className="flex justify-between">
        <span>Mg</span>
        <span>{sample.field_9063618 || '-'}</span>
      </div>

      <div className="flex justify-between">
        <span>K</span>
        <span>{sample.field_9063602 || '-'}</span>
      </div>

      <div className="flex justify-between">
        <span>Na</span>
        <span>{sample.field_9063628 || '-'}</span>
      </div>
    </div>
  </div>

  {/* Fatty Acids */}
  <div className="bg-purple-50 rounded-xl p-5 shadow">
    <h3 className="text-lg font-bold text-purple-700 mb-4">
      Fatty Acids
    </h3>

    <div className="space-y-2">
      <div className="flex justify-between">
        <span>C12:0</span>
        <span>{sample.field_9063532 || '-'}</span>
      </div>

      <div className="flex justify-between">
        <span>C16:0</span>
        <span>{sample.field_9063533 || '-'}</span>
      </div>

      <div className="flex justify-between">
        <span>C18:0</span>
        <span>{sample.field_9063534 || '-'}</span>
      </div>

      <div className="flex justify-between">
        <span>C18:1</span>
        <span>{sample.field_9063535 || '-'}</span>
      </div>

      <div className="flex justify-between">
        <span>C18:2</span>
        <span>{sample.field_9063536 || '-'}</span>
      </div>

      <div className="flex justify-between">
        <span>C18:3</span>
        <span>{sample.field_9063537 || '-'}</span>
      </div>
    </div>
  </div>

</div>

<div className="bg-white rounded-lg shadow overflow-auto max-h-[900px]">

            <table className="w-full text-sm">

              <thead className="sticky top-0 bg-gray-100 z-10">
                <tr>
                  <th className="text-left px-4 py-3 border-b">
                    Field Name
                  </th>

                  <th className="text-left px-4 py-3 border-b">
                    Value
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredFields.map(([key, value]) => (
                  <tr
                    key={key}
                    className="border-b hover:bg-gray-50"
                  >
                   <td className="px-4 py-2 font-medium">
  {FIELD_NAMES[key] || key}
</td>

                    <td className="px-4 py-2 break-all">
  {value ?? '-'}
</td>
                  </tr>
                ))}
              </tbody>

            </table>

          </div>
        </>
      )}
    </div>
  );
}