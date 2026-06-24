import React, { useState, useEffect } from 'react';
import { db } from '../services/db';

const Branches = () => {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.getBranchesWithStats().then(data => {
      setBranches(data);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  return (
    <div className="page active" id="branches-page">
      <div className="page-title">Branch Management</div>
      <div className="page-sub">Manage all Kiddorin branches</div>
      
      <div style={{ marginBottom: '20px' }}>
        <button className="btn btn-primary">+ Add New Branch</button>
      </div>
      
      <div className="branch-grid" id="branch-grid">
        {loading ? (
          <div className="branch-card skeleton" style={{ height: '200px', border: 'none' }}></div>
        ) : branches.length === 0 ? (
          <div style={{ padding: '20px', color: 'var(--text-muted)' }}>No branches found.</div>
        ) : (
          branches.map(branch => (
            <div className="branch-card" key={branch.id}>
              <div className="branch-name">🏪 {branch.name}</div>
              <div className="branch-detail">
                📍 {branch.address || 'No Address'}<br/>
                📞 {branch.phone || 'No Phone'}<br/>
                👤 {branch.admin}
              </div>
              <div className="branch-stats">
                <div className="b-stat">
                  <div className="v">{branch.stockItems.toLocaleString('en-IN')}</div>
                  <div className="l">Stock Items</div>
                </div>
                <div className="b-stat">
                  <div className="v">{branch.totalBills.toLocaleString('en-IN')}</div>
                  <div className="l">Bills</div>
                </div>
                <div className="b-stat">
                  <div className="v">₹{branch.totalRevenue.toLocaleString('en-IN')}</div>
                  <div className="l">Revenue</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Branches;
