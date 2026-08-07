import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginAdmin } from '../stores/auth';
import { motion } from 'framer-motion';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginAdmin(username, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden px-4 py-8">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 20% 20%, rgba(37,99,235,0.18), transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(59,130,246,0.12), transparent 45%), linear-gradient(160deg, #f4f4f5, #eef2ff)',
        }}
      />
      <div className="dark:hidden absolute inset-0 pointer-events-none" />
      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        onSubmit={onSubmit}
        className="relative panel w-full max-w-md p-6 sm:p-8 space-y-5"
      >
        <div>
          <div className="text-2xl font-bold tracking-tight">Nycto Retail</div>
          <p className="text-sm text-muted mt-1">Sign in to the Admin Panel</p>
        </div>
        {error && (
          <div className="rounded-xl bg-danger-soft text-danger text-sm px-3 py-2">{error}</div>
        )}
        <div className="space-y-1.5">
          <label className="section-label">Username</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </div>
        <div className="space-y-1.5">
          <label className="section-label">Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-xs text-muted text-center">Owner, admin, or manager access required</p>
      </motion.form>
    </div>
  );
}
