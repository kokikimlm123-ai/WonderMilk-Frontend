import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.response.use(
  response => response.data,
  error => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export const samplesAPI = {
  getAll: (page = 1, size = 50, feedType = '') =>
    api.get('/samples', { params: { page, size, feedType } }),
  
  getById: (id) =>
    api.get(`/samples/${id}`),
  
  search: (query) =>
    api.get('/samples/search/query', { params: { q: query } }),
  
  create: (data) =>
    api.post('/samples', data),
  
  update: (id, data) =>
    api.put(`/samples/${id}`, data),
  
  delete: (id) =>
    api.delete(`/samples/${id}`)
};

export const dashboardAPI = {
  getMetrics: () =>
    api.get('/dashboard/metrics'),

  getFeedAnalysis: () =>
    api.get('/dashboard/feed-analysis'),
  
  getFeedTypes: () =>
    api.get('/dashboard/feed-types')
};

export default api;
