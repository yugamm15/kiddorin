import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Settings = () => {
  const { user } = useAuth();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-primary mb-2 flex-center" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
          <SettingsIcon size={28} /> Settings
        </h1>
        <p className="text-muted">Manage your account and system preferences.</p>
      </div>

      <div className="card" style={{ maxWidth: '600px' }}>
        <h2 className="mb-4">Account Details</h2>
        <div className="form-group">
          <label className="form-label">Username</label>
          <input type="text" className="form-input" value={user?.username} disabled />
        </div>
        <div className="form-group">
          <label className="form-label">Role</label>
          <input type="text" className="form-input" value="Branch Admin" disabled />
        </div>
        
        <h2 className="mt-6 mb-4">System Information</h2>
        <div className="flex-between mb-2">
          <span className="text-muted">Version</span>
          <span>1.0.0</span>
        </div>
        <div className="flex-between mb-2">
          <span className="text-muted">Database</span>
          <span>Local Mock (Switch to Supabase in env)</span>
        </div>
      </div>
    </div>
  );
};

export default Settings;
