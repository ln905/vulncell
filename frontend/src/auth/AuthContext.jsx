import { createContext, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get('/auth/me');
      } catch (err) {
        if (err.status === 401) return null; // chưa đăng nhập — không phải lỗi
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // identifier: email hoặc username
  const login = async (identifier, password) => {
    const user = await api.post('/auth/login', { email: identifier, password });
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    return user;
  };

  const register = (payload) => api.post('/auth/register', payload);

  const logout = async () => {
    await api.post('/auth/logout');
    // Đặt user = null NGAY cho UI, không chờ refetch (queryClient.clear() một mình
    // không làm observer đang mount cập nhật -> đó là lý do bấm Logout bị "đơ").
    queryClient.setQueryData(['me'], null);
    // Dọn cache của các dữ liệu theo phiên đăng nhập
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  };

  return (
    <AuthContext.Provider value={{ user: data ?? null, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
