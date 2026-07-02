import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';
import toast from 'react-hot-toast';

const Billing = () => {
  const { user } = useAuth();
  const [barcode, setBarcode] = useState('');
  const [items, setItems] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [splitCash, setSplitCash] = useState('');
  const [error, setError] = useState('');
  const [billGenerated, setBillGenerated] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [discountValue, setDiscountValue] = useState('');
  const [discountType, setDiscountType] = useState('amount');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [availableCredit, setAvailableCredit] = useState(0);
  const barcodeInputRef = useRef(null);

  useEffect(() => {
    if (barcodeInputRef.current) barcodeInputRef.current.focus();
  }, []);

  useEffect(() => {
    const fetchCredit = async () => {
      if (customerPhone && customerPhone.trim().length >= 10 && user?.branch_id) {
        const bal = await db.getCustomerCredit(customerPhone.trim(), user.branch_id);
        setAvailableCredit(bal || 0);
      } else {
        setAvailableCredit(0);
      }
    };
    fetchCredit();
  }, [customerPhone, user]);

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
          category: product.category,
          name: product.category,
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

  const subtotal = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  
  let discountAmount = 0;
  let discountPercent = 0;
  if (discountValue && !isNaN(discountValue) && parseFloat(discountValue) > 0 && subtotal > 0) {
    const val = parseFloat(discountValue);
    if (discountType === 'percent') {
      discountPercent = Math.min(val, 100);
      discountAmount = Math.round((subtotal * discountPercent) / 100);
    } else {
      discountAmount = Math.min(val, subtotal);
      discountPercent = parseFloat(((discountAmount / subtotal) * 100).toFixed(2));
    }
  }
  const netBeforeCredit = Math.max(0, subtotal - discountAmount);
  const creditApplied = Math.min(availableCredit, netBeforeCredit);
  const finalAmount = Math.max(0, netBeforeCredit - creditApplied);

  const confirmBill = async () => {
    if (billGenerated) {
      toast.error('Bill already generated! Click "Clear Bill" to start a new sale.');
      return;
    }
    if (isGenerating) return;
    if (items.length === 0) {
      toast.error('Please add items to the bill first.');
      return;
    }
    setError('');
    setIsGenerating(true);
    try {
      if (paymentMethod === 'split' && finalAmount > 0) {
        if (splitCash === '' || isNaN(splitCash) || parseFloat(splitCash) < 0 || parseFloat(splitCash) > finalAmount) {
          toast.error(`Please enter a valid Cash amount between ₹0 and ₹${finalAmount} for split payment.`);
          setIsGenerating(false);
          return;
        }
      }
      const sCashAmt = paymentMethod === 'split' ? (parseFloat(splitCash) || 0) : (paymentMethod === 'cash' ? finalAmount : 0);
      const sUpiAmt = paymentMethod === 'split' ? Math.max(0, finalAmount - sCashAmt) : (paymentMethod === 'upi' ? finalAmount : 0);
      const payStr = finalAmount === 0 ? 'Store Credit' : (
        paymentMethod === 'cash' ? 'Cash' : (paymentMethod === 'upi' ? 'UPI' : `Split (Cash: ₹${sCashAmt}, GPay: ₹${sUpiAmt})`)
      );

      // Create a mapped array for db service
      const dbItems = items.map(i => ({ product_id: i.product_id, quantity: i.qty, price: i.price }));
      const newBill = await db.generateBill({
        branch_id: user.branch_id,
        total_amount: finalAmount,
        payment_method: payStr,
        split_cash: sCashAmt,
        split_upi: sUpiAmt,
        customer_name: customerName.trim() || 'Walk-in Customer',
        customer_phone: customerPhone.trim() || null
      }, dbItems);

      if (creditApplied > 0) {
        await db.deductCustomerCredit(customerPhone.trim(), user.branch_id, creditApplied);
      }
      
      toast.success('Bill generated successfully!');
      setBillGenerated({
        id: newBill.id,
        date: new Date().toLocaleString('en-IN'),
        items: items,
        subtotal: subtotal,
        discount: discountAmount,
        creditApplied: creditApplied,
        total: finalAmount,
        payment: payStr,
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone.trim()
      });
      setItems([]);
      setDiscountValue('');
      setDiscountType('amount');
      setAvailableCredit(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const clearBill = () => {
    setItems([]);
    setDiscountValue('');
    setDiscountType('amount');
    setCustomerName('');
    setCustomerPhone('');
    setAvailableCredit(0);
    setSplitCash('');
    setBillGenerated(null);
    setError('');
    if (barcodeInputRef.current) barcodeInputRef.current.focus();
  };

  const printBill = () => {
    toast.dismiss();
    window.print();
  };

  return (
    <div className="page active" id="billing-page">
      <div className="page-title">Billing / POS</div>
      <div className="page-sub">Scan barcodes to create a bill</div>
      
      <div className="billing-layout">
        <div>
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="section-title">Customer Details (Optional)</div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <input 
                type="text" 
                placeholder="Customer Name (e.g. Rahul)..." 
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                style={{ flex: '1 1 140px' }}
              />
              <input 
                type="text" 
                placeholder="Phone No. (for returns)..." 
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                style={{ flex: '1 1 140px' }}
              />
            </div>
            {availableCredit > 0 && (
              <div style={{ marginTop: '12px', background: '#d4edda', color: '#155724', padding: '10px 14px', borderRadius: '6px', border: '1px solid #c3e6cb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ fontSize: '13px' }}>💳 Store Credit Available: ₹{availableCredit}</strong>
                  <div style={{ fontSize: '11px' }}>Automatically applied to this purchase</div>
                </div>
                <span style={{ fontWeight: 800, fontSize: '16px', color: '#27ae60' }}>-₹{creditApplied}</span>
              </div>
            )}
          </div>

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
                  {items.map((item, i) => {
                    let catText = item.category || item.name || '';
                    if (item.color) {
                      const regColor = new RegExp(`\\b${item.color}\\b`, 'gi');
                      catText = catText.replace(regColor, '').trim();
                    }
                    if (item.size) {
                      const regSize = new RegExp(`\\b${item.size}\\b`, 'gi');
                      catText = catText.replace(regSize, '').trim();
                    }
                    catText = catText.replace(/\s+/g, ' ').replace(/[|-]\s*$/, '').trim() || item.category || item.name;

                    return (
                      <tr key={item.product_id}>
                        <td>{i + 1}</td>
                        <td>{catText}</td>
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
                  );
                })}
                  {items.length === 0 && (
                    <tr><td colSpan="9" style={{ textAlign: 'center', color: '#aaa', padding: '20px' }}>No items added yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="total-row" style={{ paddingBottom: '16px', borderBottom: items.length > 0 ? '1px solid var(--border)' : 'none' }}>
              <span className="label">SUBTOTAL</span>
              <span className="value" style={{ fontSize: '24px' }}>₹{subtotal.toLocaleString('en-IN')}</span>
            </div>
            
            {items.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
                  <span className="label" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>DISCOUNT (OPTIONAL)</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input 
                        type="number" 
                        value={discountType === 'percent' ? discountValue : (discountPercent ? discountPercent : '')} 
                        onChange={e => { setDiscountType('percent'); setDiscountValue(e.target.value); }} 
                        style={{ padding: '10px 26px 10px 10px', width: '92px', borderRadius: '4px', border: '1px solid var(--border)', textAlign: 'right', fontWeight: 'bold', fontSize: '14px', background: discountType === 'percent' && discountValue ? '#fff' : 'var(--off-white)' }}
                        placeholder="0"
                        min="0"
                        max="100"
                      />
                      <span style={{ position: 'absolute', right: '10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '13px' }}>%</span>
                    </div>
                    <span style={{ color: '#bbb', fontWeight: 'bold' }}>OR</span>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <span style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '13px' }}>₹</span>
                      <input 
                        type="number" 
                        value={discountType === 'amount' ? discountValue : (discountAmount ? discountAmount : '')} 
                        onChange={e => { setDiscountType('amount'); setDiscountValue(e.target.value); }} 
                        style={{ padding: '10px 10px 10px 22px', width: '110px', borderRadius: '4px', border: '1px solid var(--border)', textAlign: 'right', fontWeight: 'bold', fontSize: '14px', background: discountType === 'amount' && discountValue ? '#fff' : 'var(--off-white)' }}
                        placeholder="0"
                        min="0"
                      />
                    </div>
                  </div>
                </div>
                {discountAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0 0', color: 'var(--success)', fontWeight: 600, fontSize: '13px' }}>
                    <span>DISCOUNT APPLIED</span>
                    <span>-₹{discountAmount.toLocaleString('en-IN')} ({discountPercent}%)</span>
                  </div>
                )}
                {creditApplied > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 0', color: '#2980b9', fontWeight: 700, fontSize: '13px' }}>
                    <span>💳 STORE CREDIT REDEEMED</span>
                    <span style={{ fontFamily: "'Arial Black', 'Impact', 'Trebuchet MS', sans-serif", fontSize: '15px' }}>-₹{creditApplied.toLocaleString('en-IN')}</span>
                  </div>
                )}
              </>
            )}
            
            <div className="total-row" style={{ borderTop: 'none', paddingTop: '16px' }}>
              <span className="label" style={{ color: 'var(--dark)' }}>TOTAL AMOUNT</span>
              <span className="value" style={{ fontFamily: "'Arial Black', 'Impact', 'Trebuchet MS', sans-serif" }}>₹{finalAmount.toLocaleString('en-IN')}</span>
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
                <span className="pay-label">GPay/UPI</span>
              </div>
              <div className={`pay-btn ${paymentMethod === 'split' ? 'selected' : ''}`} onClick={() => { setPaymentMethod('split'); setSplitCash(Math.round(finalAmount / 2).toString()); }}>
                <span className="pay-icon">⚖️</span>
                <span className="pay-label">Split</span>
              </div>
            </div>
            {paymentMethod === 'split' && (
              <div style={{ marginTop: '12px', marginBottom: '12px', padding: '12px', background: 'var(--off-white)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--dark)', marginBottom: '8px' }}>⚖️ Split Breakdown (Total: ₹{finalAmount})</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>💵 Cash Amount</label>
                    <input 
                      type="number" 
                      placeholder="₹ Cash..." 
                      value={splitCash}
                      onChange={e => setSplitCash(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontWeight: 'bold' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>📱 GPay / UPI</label>
                    <input 
                      type="number" 
                      value={Math.max(0, finalAmount - (parseFloat(splitCash) || 0))}
                      readOnly
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', background: '#e9ecef', fontWeight: 'bold', color: '#004085' }}
                    />
                  </div>
                </div>
              </div>
            )}
            <button 
              className="btn btn-success" 
              style={{ width: '100%', padding: '14px', fontSize: '15px', opacity: (billGenerated || isGenerating) ? 0.7 : 1, cursor: (billGenerated || isGenerating) ? 'not-allowed' : 'pointer' }} 
              disabled={!!billGenerated || isGenerating} 
              onClick={confirmBill}
            >
              {isGenerating ? '⏳ Generating Bill...' : (billGenerated ? '✓ Bill Generated Already' : '✓ Confirm & Generate Bill')}
            </button>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: '8px' }} onClick={clearBill}>Clear Bill</button>
          </div>
          
          {billGenerated && (
            <div className="card" style={{ marginTop: '16px' }}>
              <div className="section-title">Bill Generated ✓</div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>Bill ID: <strong>{billGenerated.id.slice(0, 8).toUpperCase()}</strong> • {billGenerated.date}</div>
                <div style={{ fontSize: '13px', marginBottom: '12px' }}>Items: {billGenerated.items.length} | Payment: <span className={`badge ${billGenerated.payment?.toLowerCase() === 'cash' ? 'badge-green' : (billGenerated.payment?.toLowerCase()?.startsWith('split') ? 'badge-secondary' : 'badge-blue')}`}>{billGenerated.payment.toUpperCase()}</span></div>
                {billGenerated.discount > 0 && (
                  <div style={{ fontSize: '13px', color: 'var(--success)', marginBottom: '4px' }}>Discount Applied: ₹{billGenerated.discount.toLocaleString('en-IN')}</div>
                )}
                <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: "'Arial Black', 'Impact', 'Trebuchet MS', sans-serif", color: 'var(--dark)' }}>Total: ₹{billGenerated.total.toLocaleString('en-IN')}</div>
              </div>
              <button className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }} onClick={printBill}>🖨️ Print Bill</button>
            </div>
          )}
        </div>
      </div>

      {/* Hidden Print Bill Component */}
      {billGenerated && (
        <div id="print-bill" className="print-bill-container">
          <div className="pb-header">
            <img src="/images/logo%20black.png" alt="Kiddorin Logo" style={{ maxWidth: '180px', maxHeight: '65px', objectFit: 'contain', display: 'block', margin: '0 auto 12px auto' }} />
            <div style={{ fontSize: '10px', lineHeight: '1.4', marginBottom: '12px' }}>
              G-69 , The Boulevard , Nr. Pratham Circle, Green City Road, Pal, Surat, Gujarat 395009
            </div>
            <div style={{ fontSize: '10px', fontWeight: '600' }}>
              +91 94283 96273 | +91 94276 56615
            </div>
          </div>
          <div className="pb-details">
            <div><strong>Date:</strong> {billGenerated.date}</div>
            <div><strong>Bill No:</strong> {billGenerated.id.slice(0, 8).toUpperCase()}</div>
            {billGenerated.customerPhone && (
              <div><strong>Customer:</strong> {billGenerated.customerName} ({billGenerated.customerPhone})</div>
            )}
            {!billGenerated.customerPhone && (
              <div><strong>Customer:</strong> {billGenerated.customerName}</div>
            )}
            <div><strong>Payment:</strong> {billGenerated.payment.toUpperCase()}</div>
          </div>
          <table className="pb-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {billGenerated.items.map((item, idx) => {
                let catText = item.category || item.name || '';
                if (item.color) {
                  const regColor = new RegExp(`\\b${item.color}\\b`, 'gi');
                  catText = catText.replace(regColor, '').trim();
                }
                if (item.size) {
                  const regSize = new RegExp(`\\b${item.size}\\b`, 'gi');
                  catText = catText.replace(regSize, '').trim();
                }
                catText = catText.replace(/\s+/g, ' ').replace(/[|-]\s*$/, '').trim() || item.category || item.name;

                return (
                  <tr key={idx}>
                    <td>
                      <div style={{ fontWeight: '700', fontSize: '12px' }}>{item.design || '#'}</div>
                      <div style={{ fontSize: '10px', color: '#444' }}>{catText} {item.color ? `| ${item.color}` : ''} {item.size ? `| ${item.size}` : ''}</div>
                    </td>
                    <td>{item.qty}</td>
                    <td>{item.price}</td>
                    <td>{item.price * item.qty}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="pb-total" style={{ flexDirection: 'column', gap: '4px' }}>
            {billGenerated.discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingBottom: '4px', color: '#555' }}>
                <span>Subtotal:</span>
                <span>₹{billGenerated.subtotal.toLocaleString('en-IN')}</span>
              </div>
            )}
            {billGenerated.discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingBottom: '4px', color: '#555' }}>
                <span>Discount:</span>
                <span>-₹{billGenerated.discount.toLocaleString('en-IN')}</span>
              </div>
            )}
            {billGenerated.creditApplied > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingBottom: '8px', color: '#2980b9', fontWeight: 600 }}>
                <span>Store Credit Applied:</span>
                <span style={{ fontFamily: "'Arial Black', 'Impact', 'Trebuchet MS', sans-serif" }}>-₹{billGenerated.creditApplied.toLocaleString('en-IN')}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
              <span>Total Amount:</span>
              <span style={{ fontFamily: "'Arial Black', 'Impact', 'Trebuchet MS', sans-serif", fontSize: '16px' }}>₹{billGenerated.total.toLocaleString('en-IN')}</span>
            </div>
          </div>
          <div className="pb-footer">
            <div>Thank you for shopping with us!</div>
            <div>No Return | No Exchange</div>
            <div style={{ marginTop: '4px', fontWeight: '600' }}>Follow us on Instagram @Kiddorin</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Billing;
