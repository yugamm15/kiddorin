import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  if (user) return <Navigate to="/" />;

  const handleSubmit = async () => {
    setError(false);
    const res = await login(username, password);
    if (res.success) {
      navigate('/');
    } else {
      setError(true);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit();
  }

  return (
    <div id="login-screen">
      <div className="login-box">
        <div className="login-logo">Kiddor<span>in</span></div>
        <div className="login-tag">The World in Their Wardrobe</div>
        <input 
          type="text" 
          placeholder="Username" 
          value={username}
          onChange={e => setUsername(e.target.value)}
        />
        <input 
          type="password" 
          placeholder="Password" 
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="btn-gold" onClick={handleSubmit}>Sign In</button>
        <div className="login-err" style={{ display: error ? 'block' : 'none' }}>
          Invalid username or password.
        </div>
        <div style={{ marginTop: '16px', fontSize: '12px', color: '#aaa' }}>
          Demo: admin / password
        </div>
      </div>
    </div>
  );
};

export default Login;
