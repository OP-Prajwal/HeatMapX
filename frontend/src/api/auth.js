import apiClient from './client';

export async function registerUser(name, email, password) {
  const { data } = await apiClient.post('/api/auth/register', { name, email, password });
  return data;
}

export async function loginUser(email, password) {
  const { data } = await apiClient.post('/api/auth/login', { email, password });
  return data;
}

export async function logoutUser() {
  const { data } = await apiClient.post('/api/auth/logout');
  return data;
}

export async function fetchCurrentUser() {
  const { data } = await apiClient.get('/api/auth/me');
  return data;
}
