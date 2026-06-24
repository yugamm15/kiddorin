import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import toast from 'react-hot-toast';

const Dealers = () => {
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: ''
  });

  const loadDealers = async () => {
    setLoading(true);
    const data = await db.getDealers();
    setDealers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadDealers();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleAddDealer = async () => {
    if (!formData.name || !formData.phone || !formData.address) {
      toast.error('All dealer details (Name, Phone, Address) are required.');
      return;
    }
    try {
      await db.addDealer(formData);
      toast.success('Dealer saved successfully!');
      setFormData({ name: '', phone: '', address: '' });
      setShowForm(false);
      loadDealers();
    } catch (error) {
      toast.error("Error saving dealer: " + error.message);
    }
  };

  return (
    <div className="page active" id="dealers-page">
      <div className="page-title">Dealer Management</div>
      <div className="page-sub">Manage suppliers and view purchase history</div>
      
      <div style={{ marginBottom: '20px' }}>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add New Dealer'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ maxWidth: '600px', marginBottom: '20px' }}>
          <div className="section-title">New Dealer Details</div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label>Dealer Name</label>
            <input type="text" id="name" placeholder="e.g. Raj Textiles" value={formData.name} onChange={handleChange} />
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label>Phone Number</label>
            <input type="text" id="phone" placeholder="e.g. +91 9988776655" value={formData.phone} onChange={handleChange} />
          </div>
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label>Address</label>
            <input type="text" id="address" placeholder="Full address" value={formData.address} onChange={handleChange} />
          </div>
          <button className="btn btn-primary" onClick={handleAddDealer}>Save Dealer</button>
        </div>
      )}
      
      <div className="branch-grid">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={`skel-${i}`} className="branch-card skeleton" style={{ height: '180px', border: 'none' }}></div>
          ))
        ) : (
          <>
            {dealers.map(d => (
              <div key={d.id} className="branch-card">
                <div className="branch-name">🏢 {d.name}</div>
                <div className="branch-detail">📍 {d.address || '-'}<br/>📞 {d.phone || '-'}</div>
                <div className="branch-stats" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <div className="b-stat"><div className="v">{d.total_items}</div><div className="l">Total Items Bought</div></div>
                  <div className="b-stat"><div className="v">₹{d.total_spent.toLocaleString('en-IN')}</div><div className="l">Total Spent</div></div>
                </div>
              </div>
            ))}
            {dealers.length === 0 && !showForm && (
              <div style={{ color: '#aaa', padding: '24px' }}>No dealers found.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Dealers;
