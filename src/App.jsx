import React, { useState } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Samples } from './pages/Samples';
import { Search } from './pages/Search';
import { Upload } from './pages/Upload';
import { SampleDetails } from './pages/SampleDetails';

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [selectedSampleId, setSelectedSampleId] = useState(null);

  const pages = {
    dashboard: <Dashboard />,

    samples: (
      <Samples
        onOpenSample={(id) => {
          setSelectedSampleId(id);
          setCurrentPage('details');
        }}
      />
    ),

    search: <Search />,

    details: (
      <SampleDetails
        sampleId={selectedSampleId}
      />
    ),

    upload: <Upload />
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="flex">
        <Sidebar
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />

        <main className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {pages[currentPage]}
          </div>
        </main>
      </div>
    </div>
  );
}