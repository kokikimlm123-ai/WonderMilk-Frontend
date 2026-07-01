import { useState } from 'react';
import { samplesAPI } from '../lib/api';

export function Upload() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setMessage('Please select a file');
      setMessageType('error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setLoading(true);
        setMessage('');
        
        const lines = event.target.result.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
          setMessage('CSV file must have headers and at least one row');
          setMessageType('error');
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim());
        const records = [];

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          const record = {};
          headers.forEach((h, idx) => {
            record[h] = values[idx]?.trim() || '';
          });
          if (Object.values(record).some(v => v)) {
            records.push(record);
          }
        }

        if (records.length === 0) {
          setMessage('No valid records found in file');
          setMessageType('error');
          return;
        }

        let successCount = 0;
        let errorCount = 0;

        for (const record of records) {
          try {
            await samplesAPI.create(record);
            successCount++;
          } catch (err) {
            errorCount++;
            console.error('Error importing record:', err);
          }
        }

        setMessage(`✅ Successfully imported ${successCount} samples${errorCount > 0 ? ` (${errorCount} failed)` : ''}`);
        setMessageType('success');
        setFile(null);
      } catch (err) {
        setMessage(`❌ Error: ${err.message}`);
        setMessageType('error');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Bulk Upload</h1>
        <p className="text-gray-500 mt-1">Import samples from CSV file</p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-8">
        <form onSubmit={handleUpload} className="space-y-6">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-500 transition cursor-pointer">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0])}
              className="hidden"
              id="file-input"
            />
            <label htmlFor="file-input" className="cursor-pointer block">
              <p className="text-2xl mb-2">📁</p>
              <p className="text-lg font-medium text-gray-900">Click to upload CSV file</p>
              <p className="text-sm text-gray-500 mt-2">or drag and drop</p>
              {file && (
                <p className="text-sm text-blue-600 font-medium mt-4">
                  Selected: {file.name}
                </p>
              )}
            </label>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
            <p className="font-medium">CSV Format Requirements:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>First row must contain column headers</li>
              <li>Use field names matching your Baserow database</li>
              <li>Supported fields: Sample Number, Feed Type, CP, NDF, ADF, etc.</li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={!file || loading}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
          >
            {loading ? '⏳ Uploading...' : '📤 Upload'}
          </button>
        </form>

        {message && (
          <div className={`mt-6 p-4 rounded-lg ${
            messageType === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
