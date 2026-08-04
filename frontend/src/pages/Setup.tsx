import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, KeyRound, User, MapPin, Phone, ChevronRight, ChevronLeft, Check, Loader2 } from 'lucide-react';
import AuthLayout from '../components/ui/AuthLayout';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import log from '../utils/logger';
import { post, getUserMessage } from '../api';
import { getConfiguredBranchId, setActiveBranchId } from '../branch';

type SetupResponse = {
  token: string;
  user: { id: number; username: string; role: string; branch_id?: string; branch_name?: string };
};

const STEPS = [
  { id: 1, title: 'Owner Account', icon: User, desc: 'Create your administrator credentials' },
  { id: 2, title: 'Store Details', icon: Building2, desc: 'Configure this POS branch' },
  { id: 3, title: 'Review & Launch', icon: KeyRound, desc: 'Confirm and initialize' },
];

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['text-danger', 'text-warning', 'text-accent-500', 'text-success'];
  return { score, label: labels[Math.max(0, score - 1)] || 'Weak', color: colors[Math.max(0, score - 1)] || 'text-danger' };
}

export default function Setup() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    branch_name: 'Main Branch',
    branch_address: '',
    branch_phone: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const pwStrength = passwordStrength(formData.password);

  const validateStep = (): boolean => {
    if (step === 1) {
      if (!formData.username.trim()) { setError('Username is required'); return false; }
      if (formData.password.length < 8) { setError('Password must be at least 8 characters'); return false; }
      if (formData.password !== formData.confirmPassword) { setError('Passwords do not match'); return false; }
    }
    if (step === 2) {
      if (!formData.branch_name.trim()) { setError('Branch name is required'); return false; }
    }
    return true;
  };

  const nextStep = () => {
    if (!validateStep()) return;
    setStep(s => Math.min(s + 1, 3));
  };

  const prevStep = () => {
    setError('');
    setStep(s => Math.max(s - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setLoading(true);
    setError('');

    try {
      log.info('Setup', 'Initializing system', { username: formData.username, branch: formData.branch_name });
      const data = await post<SetupResponse>('/auth/setup', {
        username: formData.username,
        password: formData.password,
        branch_name: formData.branch_name,
        branch_address: formData.branch_address,
        branch_phone: formData.branch_phone,
        ...(getConfiguredBranchId() ? { branch_id: getConfiguredBranchId() } : {}),
      });
      log.info('Setup', 'System initialized', { userId: data?.user?.id });
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
      badge="First-time setup"
      title={STEPS[step - 1].title}
      subtitle={STEPS[step - 1].desc}
    >
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2 flex-1">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold transition-all ${
              step > s.id ? 'bg-success text-white' :
              step === s.id ? 'bg-accent-600 text-white shadow-glow' :
              'bg-neutral-100 dark:bg-neutral-800 text-muted'
            }`}>
              {step > s.id ? <Check className="w-4 h-4" /> : s.id}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 rounded-full transition-colors ${
                step > s.id ? 'bg-success' : 'bg-border'
              }`} />
            )}
          </div>
        ))}
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 p-3.5 rounded-xl bg-danger-soft border border-danger/20 text-danger text-sm font-medium"
        >
          {error}
        </motion.div>
      )}

      <motion.div
        key={step}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25 }}
      >
        {step === 1 && (
          <div className="space-y-4">
            <Input
              label="Owner username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="admin"
              autoComplete="username"
              required
            />
            <Input
              label="Password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              required
            />
            {formData.password && (
              <div className="flex items-center gap-2">
                <div className="flex gap-1 flex-1">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                      i <= pwStrength.score ? (pwStrength.score >= 3 ? 'bg-success' : pwStrength.score >= 2 ? 'bg-warning' : 'bg-danger') : 'bg-border'
                    }`} />
                  ))}
                </div>
                <span className={`text-xs font-medium ml-2 ${pwStrength.color}`}>{pwStrength.label}</span>
              </div>
            )}
            <Input
              label="Confirm password"
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Re-enter password"
              autoComplete="new-password"
              required
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Input
              label="Branch name"
              name="branch_name"
              value={formData.branch_name}
              onChange={handleChange}
              placeholder="Main Branch"
              autoComplete="organization"
              required
            />
            <Input
              label="Address"
              name="branch_address"
              value={formData.branch_address}
              onChange={handleChange}
              placeholder="123 Main Street, City"
              hint="Optional — can be updated later in Settings"
            />
            <Input
              label="Phone"
              name="branch_phone"
              value={formData.branch_phone}
              onChange={handleChange}
              placeholder="+1 (555) 000-0000"
              type="tel"
              hint="Optional"
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="surface-card p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-50 dark:bg-accent-900/30 flex items-center justify-center">
                  <User className="w-5 h-5 text-accent-600" />
                </div>
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider font-medium">Owner</p>
                  <p className="font-semibold text-foreground">{formData.username}</p>
                </div>
              </div>
              <div className="h-px bg-border-subtle" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-50 dark:bg-accent-900/30 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-accent-600" />
                </div>
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider font-medium">Branch</p>
                  <p className="font-semibold text-foreground">{formData.branch_name}</p>
                  {formData.branch_address && (
                    <p className="text-sm text-muted flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />{formData.branch_address}
                    </p>
                  )}
                  {formData.branch_phone && (
                    <p className="text-sm text-muted flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3" />{formData.branch_phone}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              By completing setup, you create the owner account and initial branch. You can add users, products, and configure hardware from Settings.
            </p>
          </div>
        )}
      </motion.div>

      {/* Navigation */}
      <div className="flex gap-3 mt-8">
        {step > 1 && (
          <Button variant="secondary" onClick={prevStep} className="flex-1">
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>
        )}
        {step < 3 ? (
          <Button onClick={nextStep} className="flex-1">
            Continue <ChevronRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={loading} className="flex-1">
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Initializing…</>
            ) : (
              <>Launch POS <ChevronRight className="w-4 h-4" /></>
            )}
          </Button>
        )}
      </div>
    </AuthLayout>
  );
}
