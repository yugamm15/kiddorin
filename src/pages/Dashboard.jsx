import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (user?.branch_id) {
      db.getDashboardStats(user.branch_id).then(setStats);
    }
  }, [user]);

  if (!stats) return null;

  const todayStr = new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  return (
    <div className="page active" id="dashboard-page">
      <div className="page-title">Dashboard</div>
      <div className="page-sub" id="dash-date">{todayStr}</div>
      
      <div className="stat-grid" id="stat-grid">
        <div className="stat-card">
          <div className="icon icon-gold">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/></svg>
          </div>
          <div className="label">Total Stock</div>
          <div className="value">{stats.totalStock}</div>
          <div className="sub">pieces across all branches</div>
        </div>
        
        <div className="stat-card">
          <div className="icon icon-green">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 14l6-6M4 4h16v2H4zM4 8h16v12H4z"/></svg>
          </div>
          <div className="label">Total Bills</div>
          <div className="value">{stats.todaySalesCount}</div>
          <div className="sub">transactions recorded</div>
        </div>
        
        <div className="stat-card">
          <div className="icon icon-blue">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div className="label">Total Revenue</div>
          <div className="value">₹{stats.todayRevenue.toLocaleString('en-IN')}</div>
          <div className="sub">total sales amount</div>
        </div>
        
        <div className="stat-card">
          <div className="icon icon-red">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          </div>
          <div className="label">Low Stock</div>
          <div className="value">{stats.lowStockAlerts}</div>
          <div className="sub">products below 5 units</div>
        </div>
        
        <div className="stat-card">
          <div className="icon icon-orange">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
          </div>
          <div className="label">Branches</div>
          <div className="value">{stats.totalBranches}</div>
          <div className="sub">active locations</div>
        </div>
        
        <div className="stat-card">
          <div className="icon icon-gold">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M7 7h10M7 11h6M7 15h8M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>
          </div>
          <div className="label">Products</div>
          <div className="value">{stats.totalStock}</div>
          <div className="sub">unique product entries</div>
        </div>
      </div>
      
      <div className="recent-title">Recent Transactions</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Bill #</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Branch</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {stats.recentTransactions.map(b => (
              <tr key={b.id}>
                <td><strong>{b.id}</strong></td>
                <td><strong>₹{b.total_amount.toLocaleString('en-IN')}</strong></td>
                <td>
                  <span className={`badge ${b.payment_method === 'Cash' ? 'badge-green' : 'badge-blue'}`}>
                    {b.payment_method.toUpperCase()}
                  </span>
                </td>
                <td>{user.branch.name}</td>
                <td>{new Date(b.created_at).toLocaleString('en-IN')}</td>
              </tr>
            ))}
            {stats.recentTransactions.length === 0 && (
               <tr><td colSpan="5" style={{ textAlign: 'center', color: '#aaa', padding: '24px' }}>No recent transactions</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;
