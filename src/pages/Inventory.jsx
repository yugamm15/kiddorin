import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';

const Inventory = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [searchName, setSearchName] = useState('');
  const [searchColor, setSearchColor] = useState('');
  const [searchSize, setSearchSize] = useState('');

  useEffect(() => {
    if (user?.branch_id) {
      db.getProducts(user.branch_id).then(setProducts);
    }
  }, [user]);

  const filtered = products.filter(s => {
    const matchName = (s.design_number + " " + s.category).toLowerCase().includes(searchName.toLowerCase());
    const matchColor = s.color.toLowerCase().includes(searchColor.toLowerCase());
    const matchSize = s.size.toLowerCase().includes(searchSize.toLowerCase());
    return matchName && matchColor && matchSize;
  });

  return (
    <div className="page active" id="inventory-page">
      <div className="page-title">Inventory</div>
      <div className="page-sub">View and manage all current stock</div>
      
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label>Design Number / Name</label>
            <input 
              type="text" 
              placeholder="e.g. 101 or Shirt" 
              value={searchName}
              onChange={e => setSearchName(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ flex: '1 1 150px' }}>
            <label>Color</label>
            <input 
              type="text" 
              placeholder="e.g. BLUE" 
              value={searchColor}
              onChange={e => setSearchColor(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ flex: '1 1 150px' }}>
            <label>Size</label>
            <input 
              type="text" 
              placeholder="e.g. 80" 
              value={searchSize}
              onChange={e => setSearchSize(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ flex: '0 0 auto' }}>
            <label>Branch</label>
            <select disabled>
              <option value="">{user?.branch?.name}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Design #</th>
              <th>Category</th>
              <th>Gender</th>
              <th>Color</th>
              <th>Size</th>
              <th>Qty</th>
              <th>Buy Price</th>
              <th>Sell Price</th>
              <th>Branch</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td><strong>{s.design_number}</strong></td>
                <td>{s.category}</td>
                <td>{s.gender}</td>
                <td>{s.color}</td>
                <td>{s.size}</td>
                <td>
                  <strong>{s.quantity}</strong> {s.quantity < 5 && <span className="low-stock-badge">LOW</span>}
                </td>
                <td>₹{s.purchase_price}</td>
                <td>₹{s.selling_price}</td>
                <td>{user?.branch?.name}</td>
                <td>
                  <span className={`badge ${s.quantity > 0 ? 'badge-green' : 'badge-red'}`}>
                    {s.quantity > 0 ? 'In Stock' : 'Out'}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="10" style={{ textAlign: 'center', color: '#aaa', padding: '24px' }}>No products found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Inventory;
