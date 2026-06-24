import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';
import toast from 'react-hot-toast';

const Reports = () => {
  const { user } = useAuth();
  const [currentReport, setCurrentReport] = useState(null);
  const [reportData, setReportData] = useState(null);

  const titles = {
    sales: '📊 Sales Report', 
    stock: '📦 Stock Report', 
    lowstock: '⚠️ Low Stock Alert',
    purchase: '🛒 Purchase Report', 
    payment: '💳 Payment Report', 
    profit: '💰 Profit & Loss Report',
    product: '👕 Product-wise Sales', 
    branch: '🏪 Branch-wise Report', 
    transactions: '🧾 All Transactions'
  };

  const showReport = async (type) => {
    setCurrentReport(type);
    
    const allData = db.getData();
    const branchBills = allData.bills.filter(b => b.branch_id === user.branch_id);
    const branchProducts = allData.products.filter(p => p.branch_id === user.branch_id);
    
    let html = null;

    if (type === 'sales' || type === 'transactions') {
      const total = branchBills.reduce((a, b) => a + b.total_amount, 0);
      const cash = branchBills.filter(b => b.payment_method === 'Cash').reduce((a, b) => a + b.total_amount, 0);
      const upi = branchBills.filter(b => b.payment_method === 'UPI').reduce((a, b) => a + b.total_amount, 0);
      html = (
        <>
          <div className="stat-grid" style={{ marginBottom: '16px' }}>
            <div className="stat-card"><div className="label">Total Bills</div><div className="value">{branchBills.length}</div></div>
            <div className="stat-card"><div className="label">Total Revenue</div><div className="value">₹{total.toLocaleString('en-IN')}</div></div>
            <div className="stat-card"><div className="label">Cash / UPI</div><div className="value">₹{cash.toLocaleString('en-IN')} / ₹{upi.toLocaleString('en-IN')}</div></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Bill #</th><th>Total</th><th>Payment</th><th>Branch</th><th>Date</th></tr></thead>
              <tbody>
                {branchBills.map(b => (
                  <tr key={b.id}>
                    <td><strong>{b.id}</strong></td>
                    <td>₹{b.total_amount.toLocaleString('en-IN')}</td>
                    <td><span className={`badge ${b.payment_method === 'Cash' ? 'badge-green' : 'badge-blue'}`}>{b.payment_method.toUpperCase()}</span></td>
                    <td>{user?.branch?.name}</td>
                    <td>{new Date(b.created_at).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
    } 
    else if (type === 'stock') {
      html = (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Design</th><th>Category</th><th>Gender</th><th>Color</th><th>Size</th><th>Qty</th><th>Sell Price</th><th>Branch</th><th>Status</th></tr></thead>
            <tbody>
              {branchProducts.map(s => (
                <tr key={s.id}>
                  <td>{s.design_number}</td><td>{s.category}</td><td>{s.gender}</td><td>{s.color}</td><td>{s.size}</td>
                  <td><strong>{s.quantity}</strong></td><td>₹{s.selling_price}</td><td>{user?.branch?.name}</td>
                  <td><span className={`badge ${s.quantity > 0 ? 'badge-green' : 'badge-red'}`}>{s.quantity > 0 ? 'In Stock' : 'Out'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    // Simple fallbacks for others
    else {
      html = <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Data unavailable for this mock report type yet.</div>;
    }

    setReportData(html);
  };

  const exportCSV = () => {
    toast.success("Export CSV triggered");
  };

  return (
    <div className="page active" id="reports-page">
      <div className="page-title">Reports</div>
      <div className="page-sub">Generate and export all types of business reports</div>
      
      <div className="report-grid">
        {Object.entries(titles).map(([key, title]) => (
          <div key={key} className="report-btn" onClick={() => showReport(key)}>
            <div className="r-icon">{title.split(' ')[0]}</div>
            <div className="r-title">{title.substring(title.indexOf(' ') + 1)}</div>
            <div className="r-desc">Generate {title.substring(title.indexOf(' ') + 1)}</div>
          </div>
        ))}
      </div>
      
      {currentReport && (
        <div className="report-output" id="report-output">
          <div className="report-header">
            <div className="recent-title" id="report-title" style={{ margin: 0 }}>{titles[currentReport]}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={exportCSV}>⬇️ Export CSV</button>
              <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Print</button>
            </div>
          </div>
          <div className="filter-row">
            <input type="date" id="rep-from" />
            <input type="date" id="rep-to" />
            <select style={{ padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px' }} disabled>
              <option>{user?.branch?.name}</option>
            </select>
            <button className="btn btn-primary">Apply Filter</button>
          </div>
          <div id="report-body">
            {reportData}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
