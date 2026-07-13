import axios from 'axios';

// Base URL for the Flask backend. Override with VITE_API_BASE_URL in a
// frontend/.env file if the backend isn't running on localhost:5000.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// withCredentials is required so the browser sends/stores the Flask-Login
// session cookie when the frontend (5173) and backend (5000) run on
// different ports. This client is used only for the new auth endpoints -
// the existing /api/predict call in Dashboard.jsx is left untouched.
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default apiClient;
