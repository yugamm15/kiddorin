import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';
import toast from 'react-hot-toast';

const Inventory = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchName, setSearchName] = useState('');
  const [searchColor, setSearchColor] = useState('');
  const [searchSize, setSearchSize] = useState('');

  const [dealers, setDealers] = useState([]);
  const [restockProduct, setRestockProduct] = useState(null);
  const [restockQty, setRestockQty] = useState('');
  const [restockPrice, setRestockPrice] = useState('');
  const [restockDealer, setRestockDealer] = useState('');

  useEffect(() => {
    db.getDealers().then(setDealers);
  }, []);

  useEffect(() => {
    if (user?.branch_id) {
      db.getProducts(user.branch_id).then(data => {
        setProducts(data || []);
        setLoading(false);
      });
    }
  }, [user]);

  const openRestock = (product) => {
    setRestockProduct(product);
    setRestockPrice(product.purchase_price);
    setRestockQty('');
    setRestockDealer('');
  };

  const handleRestock = async () => {
    if (!restockQty || parseInt(restockQty) <= 0) {
      toast.error('Enter valid quantity');
      return;
    }
    try {
      await db.addStock({
        category: restockProduct.category,
        gender: restockProduct.gender,
        design_number: restockProduct.design_number,
        color: restockProduct.color,
        size: restockProduct.size,
        quantity: restockQty,
        purchase_price: restockPrice,
        selling_price: restockProduct.selling_price,
        dealer_id: restockDealer,
        branch_id: user.branch_id,
        date: new Date().toISOString().split('T')[0]
      });
      toast.success(`Successfully added ${restockQty} to stock!`);
      setRestockProduct(null);
      // Refresh products list
      const data = await db.getProducts(user.branch_id);
      setProducts(data || []);
    } catch (err) {
      toast.error(err.message);
    }
  };

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
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={`skel-${i}`}>
                  <td colSpan="11" style={{ padding: '8px 16px' }}>
                    <div className="skeleton skeleton-table-row" style={{ marginBottom: 0 }}></div>
                  </td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan="11" style={{ textAlign: 'center', color: '#aaa', padding: '24px' }}>No products found</td></tr>
            ) : (
              filtered.map(s => (
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
                  <td>
                    <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '10px' }} onClick={() => openRestock(s)}>
                      ➕ RESTOCK
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Restock Modal */}
      {restockProduct && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="card" style={{ width: '400px', margin: 0 }}>
            <div className="section-title">Restock Inventory</div>
            <p style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>
              Restocking: <strong style={{ color: 'var(--dark)' }}>{restockProduct.design_number}</strong> | {restockProduct.color} | {restockProduct.size}
            </p>
            
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Add Quantity</label>
              <input type="number" min="1" value={restockQty} onChange={e => setRestockQty(e.target.value)} placeholder="e.g. 10" />
            </div>
            
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>New Purchase Price (₹)</label>
              <input type="number" min="0" value={restockPrice} onChange={e => setRestockPrice(e.target.value)} />
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label>Dealer (Optional)</label>
              <select value={restockDealer} onChange={e => setRestockDealer(e.target.value)}>
                <option value="">Select Dealer...</option>
                {dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleRestock}>Confirm Restock</button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setRestockProduct(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
