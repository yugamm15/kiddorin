import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import toast from 'react-hot-toast';

const Branches = () => {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    password: ''
  });

  const fetchBranches = () => {
    db.getBranchesWithStats().then(data => {
      setBranches(data);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.password.trim()) {
      toast.error('Branch Name, Email ID, and Password are required!');
      return;
    }
    setSubmitting(true);
    const toastId = toast.loading('Creating store branch and registering login account... Please wait ⏳');
    try {
      await db.addBranch(formData);
      toast.success(`Branch "${formData.name}" and login credentials created successfully!`, { id: toastId });
      setShowModal(false);
      setFormData({ name: '', address: '', phone: '', email: '', password: '' });
      fetchBranches();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to create branch.', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page active" id="branches-page">
      <div className="page-title">Branch Management</div>
      <div className="page-sub">Manage all Kiddorin branches and their private store credentials</div>
      
      <div style={{ marginBottom: '20px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add New Branch</button>
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
                👤 Login ID: <strong style={{ color: 'var(--primary)' }}>{branch.admin}</strong>
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

      {/* Add New Branch Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="card" style={{ width: '450px', margin: '20px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="section-title" style={{ marginBottom: '6px' }}>🏪 Create New Branch Store</div>
            <p style={{ marginBottom: '20px', fontSize: '13px', color: 'var(--text-muted)' }}>
              Set up store details and private login credentials. Anyone logging in with these credentials will only access this branch's data.
            </p>
            
            <form onSubmit={handleSubmit}>
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '16px' }}>
                <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '12px', color: 'var(--dark)' }}>📍 Store Information</div>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Branch Name *</label>
                  <input type="text" name="name" required value={formData.name} onChange={handleInputChange} placeholder="e.g. Surat - CG Road Branch" />
                </div>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Location / Address</label>
                  <input type="text" name="address" value={formData.address} onChange={handleInputChange} placeholder="e.g. 102, Fashion Hub, Surat" />
                </div>
                <div className="form-group" style={{ marginBottom: '0' }}>
                  <label>Contact Phone</label>
                  <input type="text" name="phone" value={formData.phone} onChange={handleInputChange} placeholder="e.g. +91 9876543210" />
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '12px', color: 'var(--primary)' }}>🔐 Branch Login Credentials</div>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Login Email ID *</label>
                  <input type="email" name="email" required value={formData.email} onChange={handleInputChange} placeholder="e.g. cgroad@kiddorin.com" />
                </div>
                <div className="form-group" style={{ marginBottom: '0' }}>
                  <label>Login Password *</label>
                  <input type="password" name="password" required value={formData.password} onChange={handleInputChange} placeholder="Create a strong password" />
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Creating Branch...' : '✔ Save & Create Branch'}
                </button>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)} disabled={submitting}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Branches;
