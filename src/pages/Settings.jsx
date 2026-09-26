import React, { useState } from 'react';
import { Settings as SettingsIcon, ShieldCheck, Lock, Unlock, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePricePrivacy } from '../context/PricePrivacyContext';
import toast from 'react-hot-toast';

const Settings = () => {
  const { user } = useAuth();
  const { isPriceUnlocked, lockPrices, openUnlockModal, changePin, resetPinToDefault } = usePricePrivacy();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [submittingPin, setSubmittingPin] = useState(false);

  const handleUpdatePin = async (e) => {
    e.preventDefault();
    if (!currentPin) {
      toast.error('Please enter your current security PIN.');
      return;
    }
    if (!newPin || newPin.length < 4) {
      toast.error('New PIN must be at least 4 digits or characters.');
      return;
    }
    if (newPin !== confirmPin) {
      toast.error('New PIN and Confirm PIN do not match.');
      return;
    }

    setSubmittingPin(true);
    try {
      await changePin(currentPin, newPin);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (err) {
      toast.error(err.message || 'Failed to update PIN.');
    } finally {
      setSubmittingPin(false);
    }
  };

  const handleResetPin = async () => {
    const pin = prompt('Enter your CURRENT PIN to reset security PIN to default:');
    if (!pin) return;
    try {
      await resetPinToDefault(pin);
    } catch (err) {
      toast.error(err.message || 'Failed to reset PIN.');
    }
  };

  return (
    <div className="page active" id="settings-page">
      <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <SettingsIcon size={24} /> Settings
      </div>
      <div className="page-sub">Manage your store account and security preferences</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginTop: '20px' }}>
        
        {/* Account Details Card */}
        <div className="card">
          <div className="section-title">👤 Account Details</div>
          <div className="form-group" style={{ marginBottom: '14px' }}>
            <label>Login Email / User</label>
            <input type="text" value={user?.email || user?.username || 'admin'} disabled style={{ opacity: 0.8 }} />
          </div>
          <div className="form-group" style={{ marginBottom: '14px' }}>
            <label>Assigned Role</label>
            <input type="text" value={user?.role === 'superadmin' ? 'Super Administrator' : 'Branch Store Manager'} disabled style={{ opacity: 0.8 }} />
          </div>
          <div className="form-group" style={{ marginBottom: '14px' }}>
            <label>Store Location / Branch</label>
            <input type="text" value={user?.branch?.name || 'Main Store'} disabled style={{ opacity: 0.8 }} />
          </div>

          <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <div className="section-title" style={{ fontSize: '14px', marginBottom: '8px' }}>ℹ️ System Information</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
              <span>Application Version</span>
              <strong style={{ color: 'var(--dark)' }}>v2.4.0 Luxury Edition</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '12px' }}>
              <span>Database Engine</span>
              <strong style={{ color: 'var(--success)' }}>Supabase Realtime Cloud</strong>
            </div>
          </div>
        </div>

        {/* Buying Price Privacy & Security Card */}
        <div className="card" style={{ border: '1px solid var(--gold)' }}>
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--gold-dark)' }}>
            <ShieldCheck size={20} /> Shopkeeper Buying Price Privacy
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
            Protects wholesale buying prices, supplier purchase costs, and profit margins from being visible to counter staff or customers.
          </p>

          {/* Current Status Box */}
          <div style={{
            background: isPriceUnlocked ? 'rgba(30, 70, 32, 0.06)' : 'rgba(197, 160, 89, 0.1)',
            border: `1px solid ${isPriceUnlocked ? 'var(--success)' : 'var(--gold)'}`,
            padding: '14px 16px',
            borderRadius: 'var(--radius)',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, color: 'var(--text-muted)' }}>
                Current Privacy Status
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: isPriceUnlocked ? 'var(--success)' : '#856404', marginTop: '2px' }}>
                {isPriceUnlocked ? '🔓 UNLOCKED (Buying Prices Visible)' : '🔒 LOCKED (Buying Prices Hidden)'}
              </div>
            </div>

            {isPriceUnlocked ? (
              <button 
                className="btn btn-primary" 
                onClick={lockPrices}
                style={{ padding: '8px 14px', fontSize: '12px', background: 'var(--dark)', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Lock size={14} /> Lock Now
              </button>
            ) : (
              <button 
                className="btn btn-primary" 
                onClick={() => openUnlockModal()}
                style={{ padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Unlock size={14} /> Unlock with PIN
              </button>
            )}
          </div>

          {/* Change PIN Form */}
          <form onSubmit={handleUpdatePin}>
            <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <KeyRound size={16} /> Change Security PIN / Password
            </div>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Current PIN</label>
              <input 
                type="password" 
                placeholder="Enter current security PIN" 
                value={currentPin}
                onChange={e => setCurrentPin(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div className="form-group">
                <label>New PIN (Min 4 chars)</label>
                <input 
                  type="password" 
                  placeholder="e.g. New 4-digit PIN" 
                  value={newPin}
                  onChange={e => setNewPin(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="form-group">
                <label>Confirm New PIN</label>
                <input 
                  type="password" 
                  placeholder="Re-type new PIN" 
                  value={confirmPin}
                  onChange={e => setConfirmPin(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={submittingPin || !currentPin || !newPin || !confirmPin}
                style={{ flex: 1, padding: '10px 16px' }}
              >
                {submittingPin ? 'Updating...' : 'Update Security PIN'}
              </button>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={handleResetPin}
                style={{ fontSize: '11px', padding: '10px 12px' }}
                title="Reset security PIN back to default"
              >
                Reset Default
              </button>
            </div>
          </form>

        </div>

      </div>
    </div>
  );
};

export default Settings;
