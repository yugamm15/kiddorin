import React from 'react';
import { useAuth } from '../context/AuthContext';

const Branches = () => {
  const { user } = useAuth();

  return (
    <div className="page active" id="branches-page">
      <div className="page-title">Branch Management</div>
      <div className="page-sub">Manage all Kiddorin branches</div>
      
      <div style={{ marginBottom: '20px' }}>
        <button className="btn btn-primary">+ Add New Branch</button>
      </div>
      
      <div className="branch-grid" id="branch-grid">
        <div className="branch-card">
          <div className="branch-name">🏪 {user?.branch?.name}</div>
          <div className="branch-detail">📍 {user?.branch?.address}<br/>📞 {user?.branch?.phone}<br/>👤 Admin</div>
          <div className="branch-stats">
            <div className="b-stat"><div className="v">--</div><div className="l">Stock Items</div></div>
            <div className="b-stat"><div className="v">--</div><div className="l">Bills</div></div>
            <div className="b-stat"><div className="v">--</div><div className="l">Revenue</div></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Branches;
