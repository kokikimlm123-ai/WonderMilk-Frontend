import React from 'react';
export function Sidebar({ currentPage, onPageChange }) {
const pages = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'samples', label: 'Samples', icon: '📋' },
  { id: 'search', label: 'Search', icon: '🔍' },
  { id: 'details', label: 'Sample Details', icon: '📄' },
  { id: 'upload', label: 'Upload', icon: '⬆️' }
];

return (
  <aside className="w-64 bg-white shadow-md min-h-screen border-r">
<div className="p-4 border-b">
  <img
    src="/wonder-milk-logo.png"
    alt="Wonder Milk"
    className="w-24 mx-auto"
  />

  <h2 className="text-center font-bold mt-1">
    Wonder Milk Lab Database
  </h2>
</div>

    

    <nav className="p-4 space-y-2">
{pages.map(page => (
<button
key={page.id}
onClick={() => onPageChange(page.id)}
className={`w-full text-left px-4 py-3 rounded-lg font-medium transition ${
              currentPage === page.id
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
> <span className="mr-2">{page.icon}</span>
{page.label} </button>
))} </nav> </aside>
);
}

