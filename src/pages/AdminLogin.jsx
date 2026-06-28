import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const { login, logout, user } = useAuth();
  const navigate = useNavigate();

  if (user && user.role === 'superadmin') return <Navigate to="/" />;

  const handleSubmit = async () => {
    setErrorMsg('');
    const res = await login(email, password);
    if (res.success) {
      if (res.userData?.role !== 'superadmin') {
        await logout();
        setErrorMsg('Access Denied: This portal is strictly restricted to Super Admin accounts.');
      } else {
        navigate('/');
      }
    } else {
      setErrorMsg('Invalid email or password.');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div id="login-screen">
      <div className="login-box">
        <div style={{ marginBottom: '12px', color: 'var(--gold, #C5A059)', fontWeight: 'bold', fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase' }}>
          🔒 Super Admin Portal
        </div>
        <div className="login-logo">Kiddor<span>in</span></div>
        <div className="login-tag">Central Administration & Catalog Management</div>
        <input 
          type="email" 
          placeholder="Super Admin Email" 
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input 
          type="password" 
          placeholder="Password" 
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="btn-gold" onClick={handleSubmit}>
          Authenticate
        </button>
        {errorMsg && (
          <div className="login-err" style={{ display: 'block', marginTop: '12px' }}>
            {errorMsg}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminLogin;
