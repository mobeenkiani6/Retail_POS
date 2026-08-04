import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import AuthLayout from '../components/ui/AuthLayout';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import log from '../utils/logger';
import { post, getUserMessage } from '../api';
import { setActiveBranchId } from '../branch';

type LoginResponse = {
  token: string;
  user: { id: number; username: string; role: string; branch_id?: string; branch_name?: string };
};

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: '', password: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      log.info('Login', 'Attempting login', { username: formData.username });
      const data = await post<LoginResponse>('/auth/login', formData);
      if (data?.token) localStorage.setItem('auth_token', data.token);
      if (data?.user) {
        localStorage.setItem('user', JSON.stringify(data.user));
        setActiveBranchId(data.user.branch_id);
      }
      navigate('/operations');
    } catch (err) {
      setError(getUserMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      badge="Sign in"
      title="Welcome back"
      subtitle="Enter your credentials to access the terminal"
    >
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 p-3.5 rounded-xl bg-danger-soft border border-danger/20 text-danger text-sm font-medium"
        >
          {error}
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Username"
          name="username"
          value={formData.username}
          onChange={e => setFormData(p => ({ ...p, username: e.target.value }))}
          placeholder="Enter username"
          autoComplete="username"
          required
        />
        <Input
          label="Password"
          name="password"
          type="password"
          value={formData.password}
          onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
          placeholder="Enter password"
          autoComplete="current-password"
          required
        />
        <Button type="submit" disabled={loading} className="w-full mt-2" size="lg">
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
          ) : (
            'Sign in to terminal'
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
