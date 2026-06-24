import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';
import toast from 'react-hot-toast';

const Billing = () => {
  const { user } = useAuth();
  const [barcode, setBarcode] = useState('');
  const [items, setItems] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [error, setError] = useState('');
  const [billGenerated, setBillGenerated] = useState(null);
  const barcodeInputRef = useRef(null);

  useEffect(() => {
    if (barcodeInputRef.current) barcodeInputRef.current.focus();
  }, []);

  const handleScan = async () => {
    if (!barcode.trim()) return;
    setError('');

    try {
      const product = await db.getProductByBarcode(barcode.trim(), user.branch_id);
      
      const existingItem = items.find(i => i.product_id === product.id);
      if (existingItem) {
        if (existingItem.qty + 1 > product.quantity) {
          throw new Error(`Only ${product.quantity} pieces in stock!`);
        }
        setItems(items.map(i => i.product_id === product.id ? { ...i, qty: i.qty + 1 } : i));
      } else {
        setItems([...items, {
          product_id: product.id,
          name: `${product.category} ${product.color} ${product.size}`,
          design: product.design_number,
          size: product.size,
          color: product.color,
          price: product.selling_price,
          max_qty: product.quantity,
          qty: 1
        }]);
      }
      setBarcode('');
    } catch (err) {
      toast.error(err.message || "Invalid barcode or out of stock.");
      setBarcode('');
    }
    if (barcodeInputRef.current) barcodeInputRef.current.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleScan();
  };

  const updateQuantity = (id, delta) => {
    setItems(items.map(item => {
      if (item.product_id === id) {
        const newQty = item.qty + delta;
        if (newQty < 1) return null; // will be filtered
        if (newQty > item.max_qty) {
          toast.error(`Only ${item.max_qty} pieces in stock!`);
          return item;
        }
        return { ...item, qty: newQty };
      }
      return item;
    }).filter(Boolean));
  };

  const removeItem = (id) => {
    setItems(items.filter(i => i.product_id !== id));
  };

  const total = items.reduce((sum, item) => sum + (item.price * item.qty), 0);

  const confirmBill = async () => {
    if (items.length === 0) {
      toast.error('Please add items to the bill first.');
      return;
    }
    setError('');
    try {
      // Create a mapped array for db service
      const dbItems = items.map(i => ({ product_id: i.product_id, quantity: i.qty, price: i.price }));
      const newBill = await db.generateBill({
        branch_id: user.branch_id,
        total_amount: total,
        payment_method: paymentMethod === 'cash' ? 'Cash' : 'UPI'
      }, dbItems);
      
      toast.success('Bill generated successfully!');
      setBillGenerated({
        id: newBill.id,
        date: new Date().toLocaleString('en-IN'),
        items: items,
        total: total,
        payment: paymentMethod
      });
      setItems([]);
    } catch (err) {
      setError(err.message);
    }
  };

  const clearBill = () => {
    setItems([]);
    setBillGenerated(null);
    setError('');
    if (barcodeInputRef.current) barcodeInputRef.current.focus();
  };

  const printBill = () => {
    window.print();
  };

  return (
    <div className="page active" id="billing-page">
      <div className="page-title">Billing / POS</div>
      <div className="page-sub">Scan barcodes to create a bill</div>
      
      <div className="billing-layout">
        <div>
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="section-title">Scan Item</div>
            <div className="scan-input-wrap">
              <input 
                type="text" 
                ref={barcodeInputRef}
                placeholder="Scan barcode or type barcode number..." 
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button className="btn btn-primary" onClick={handleScan}>Add</button>
            </div>
            {error && <div className="alert alert-danger" style={{ display: 'block' }}>{error}</div>}
          </div>
          
          <div className="card">
            <div className="section-title">Bill Items</div>
            <div className="table-wrap">
              <table className="bill-items-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Size</th>
                    <th>Color</th>
                    <th>Design</th>
                    <th>Price</th>
                    <th>Qty</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={item.product_id}>
                      <td>{i + 1}</td>
                      <td>{item.name}</td>
                      <td>{item.size}</td>
                      <td>{item.color}</td>
                      <td>{item.design}</td>
                      <td>₹{item.price}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button onClick={() => updateQuantity(item.product_id, -1)} style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', background: '#fff' }}>-</button>
                          {item.qty}
                          <button onClick={() => updateQuantity(item.product_id, 1)} style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', background: '#fff' }}>+</button>
                        </div>
                      </td>
                      <td>₹{item.price * item.qty}</td>
                      <td><span onClick={() => removeItem(item.product_id)} style={{ color: 'var(--danger)', cursor: 'pointer', fontSize: '16px' }}>✕</span></td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr><td colSpan="9" style={{ textAlign: 'center', color: '#aaa', padding: '20px' }}>No items added yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="total-row">
              <span className="label">TOTAL AMOUNT</span>
              <span className="value">₹{total.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
        
        <div>
          <div className="card">
            <div className="section-title">Payment</div>
            <div className="payment-btns">
              <div className={`pay-btn ${paymentMethod === 'cash' ? 'selected' : ''}`} onClick={() => setPaymentMethod('cash')}>
                <span className="pay-icon">💵</span>
                <span className="pay-label">Cash</span>
              </div>
              <div className={`pay-btn ${paymentMethod === 'upi' ? 'selected' : ''}`} onClick={() => setPaymentMethod('upi')}>
                <span className="pay-icon">📱</span>
                <span className="pay-label">UPI</span>
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Branch</label>
              <select style={{ width: '100%', marginTop: '6px', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '14px' }} disabled>
                <option>{user?.branch?.name}</option>
              </select>
            </div>
            <button className="btn btn-success" style={{ width: '100%', padding: '14px', fontSize: '15px' }} onClick={confirmBill}>✓ Confirm & Generate Bill</button>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: '8px' }} onClick={clearBill}>Clear Bill</button>
          </div>
          
          {billGenerated && (
            <div className="card" style={{ marginTop: '16px' }}>
              <div className="section-title">Bill Generated ✓</div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>Bill ID: <strong>{billGenerated.id.toUpperCase()}</strong> • {billGenerated.date}</div>
                <div style={{ fontSize: '13px', marginBottom: '4px' }}>Branch: {user?.branch?.name}</div>
                <div style={{ fontSize: '13px', marginBottom: '12px' }}>Items: {billGenerated.items.length} | Payment: <span className={`badge ${billGenerated.payment === 'cash' ? 'badge-green' : 'badge-blue'}`}>{billGenerated.payment.toUpperCase()}</span></div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--dark)' }}>Total: ₹{billGenerated.total.toLocaleString('en-IN')}</div>
              </div>
              <button className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }} onClick={printBill}>🖨️ Print Bill</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Billing;
