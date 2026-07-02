import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';
import toast from 'react-hot-toast';

const Exchanges = () => {
  const { user } = useAuth();
  const [customerBills, setCustomerBills] = useState([]);
  const [loadingBills, setLoadingBills] = useState(true);
  const [searchCustomer, setSearchCustomer] = useState('');
  const [selectedBill, setSelectedBill] = useState(null);

  // Return state
  const [returnedItem, setReturnedItem] = useState(null);
  const [returnReason, setReturnReason] = useState('Size Issue');
  const [customReason, setCustomReason] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Exchange state
  const [exchangeBarcode, setExchangeBarcode] = useState('');
  const [exchangedItem, setExchangedItem] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [processing, setProcessing] = useState(false);

  // Receipt modal
  const [completedExchange, setCompletedExchange] = useState(null);
  const [branchReturns, setBranchReturns] = useState([]);
  const [viewingReturnHistory, setViewingReturnHistory] = useState(null);
  const [viewingBillPreview, setViewingBillPreview] = useState(null);

  useEffect(() => {
    if (user?.branch_id) {
      loadBills();
    }
  }, [user]);

  const loadBills = async () => {
    setLoadingBills(true);
    try {
      const [bills, rets] = await Promise.all([
        db.getCustomerBills(user.branch_id),
        db.getBranchReturns(user.branch_id)
      ]);
      setCustomerBills(bills || []);
      setBranchReturns(rets || []);
    } catch (err) {
      toast.error('Failed to load past bills');
    } finally {
      setLoadingBills(false);
    }
  };

  const filteredBills = customerBills.filter(b => {
    const q = searchCustomer.toLowerCase();
    const matchPhone = (b.customer_phone || '').toLowerCase().includes(q);
    const matchName = (b.customer_name || '').toLowerCase().includes(q);
    const matchId = (b.id || '').toLowerCase().includes(q);
    return matchPhone || matchName || matchId;
  });

  const selectBillForReturn = (bill) => {
    setSelectedBill(bill);
    setCustomerName(bill?.customer_name || '');
    setCustomerPhone(bill?.customer_phone || '');
    const firstItem = (bill?.bill_items || [])[0];
    setReturnedItem(firstItem || null);
    setExchangedItem(null);
    setExchangeBarcode('');
  };

  const handleViewBill = (bill, billRets) => {
    if (billRets && billRets.length > 0) {
      const latestRet = billRets[0];
      const bItems = bill.bill_items || [];
      const matchItem = bItems.find(bi => bi.product_id === latestRet.returned_product_id || bi.products?.id === latestRet.returned_product_id) || bItems[0];

      setViewingBillPreview({
        type: 'return',
        id: latestRet.id || 'RET-' + bill.id,
        date: new Date(latestRet.created_at).toLocaleString('en-IN'),
        customerName: latestRet.customer_name || bill.customer_name || 'Walk-in Customer',
        customerPhone: latestRet.customer_phone || bill.customer_phone || '',
        returnedItem: {
          products: matchItem?.products || { category: 'Product', size: '' },
          price_at_sale: matchItem?.price_at_sale || 0
        },
        returnReason: latestRet.return_reason || 'Return',
        exchangedItem: latestRet.exchanged_product || null,
        netAmount: Number(latestRet.net_amount || 0),
        paymentMethod: latestRet.payment_method || 'Store Credit Note'
      });
    } else {
      setViewingBillPreview({
        type: 'sale',
        id: bill.id,
        date: new Date(bill.created_at).toLocaleString('en-IN'),
        customerName: bill.customer_name || 'Walk-in Customer',
        customerPhone: bill.customer_phone || '',
        payment: bill.payment_method || 'Cash',
        total: Number(bill.total_amount || 0),
        items: (bill.bill_items || []).map(bi => ({
          category: bi.products?.category || 'Item',
          name: bi.products?.category || 'Item',
          design: bi.products?.design_number || '',
          size: bi.products?.size || '',
          color: bi.products?.color || '',
          price: Number(bi.price_at_sale || 0),
          qty: bi.quantity
        }))
      });
    }
  };

  const handleScanNewItem = async () => {
    if (!exchangeBarcode.trim()) return;
    try {
      const prod = await db.getProductByBarcode(exchangeBarcode.trim(), user.branch_id);
      setExchangedItem(prod);
      setExchangeBarcode('');
      toast.success('Added replacement item!');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const calculateNetDifference = () => {
    const retVal = returnedItem ? (Number(returnedItem.price_at_sale) * returnedItem.quantity) : 0;
    const exVal = exchangedItem ? Number(exchangedItem.selling_price) : 0;
    return exVal - retVal;
  };

  const handleConfirmExchange = async () => {
    if (!returnedItem) {
      toast.error('Select an item being returned');
      return;
    }
    const netDiff = calculateNetDifference();
    if (netDiff < 0 && !customerPhone.trim()) {
      toast.error('Please enter Customer Phone Number to save Store Credit balance.');
      return;
    }
    setProcessing(true);
    try {
      const finalReason = returnReason === 'Other' ? customReason : returnReason;

      const payload = {
        branch_id: user.branch_id,
        original_bill_id: selectedBill?.id || null,
        customer_name: customerName.trim() || selectedBill?.customer_name || 'Walk-in Customer',
        customer_phone: customerPhone.trim() || selectedBill?.customer_phone || null,
        returned_product_id: returnedItem.product_id,
        returned_qty: returnedItem.quantity,
        return_reason: finalReason,
        exchanged_product_id: exchangedItem?.id || null,
        exchanged_qty: exchangedItem ? 1 : 0,
        net_amount: netDiff,
        payment_method: netDiff > 0 ? paymentMethod : 'Store Credit Note'
      };

      const result = await db.processExchange(payload);
      toast.success('Exchange processed successfully!');

      setCompletedExchange({
        id: result?.id || 'EX-' + Math.floor(Math.random()*10000),
        date: new Date().toLocaleString('en-IN'),
        customerName: customerName.trim() || selectedBill?.customer_name || 'Walk-in Customer',
        customerPhone: customerPhone.trim() || selectedBill?.customer_phone || '',
        returnedItem: returnedItem,
        returnReason: finalReason,
        exchangedItem: exchangedItem,
        netAmount: netDiff,
        paymentMethod: netDiff > 0 ? paymentMethod : 'Store Credit Note'
      });

      // reset inputs
      setSelectedBill(null);
      setReturnedItem(null);
      setExchangedItem(null);
      loadBills();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const netDiff = calculateNetDifference();

  return (
    <div className="page active" id="exchanges-page">
      <div className="page-title">Customer Returns & Exchanges</div>
      <div className="page-sub">Process product returns and replacements seamlessly</div>

      {!selectedBill ? (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div className="section-title" style={{ margin: 0 }}>Select Past Bill / Customer</div>
            <input 
              type="text" 
              placeholder="🔍 Search Customer Name, Phone, or Bill #..." 
              value={searchCustomer}
              onChange={e => setSearchCustomer(e.target.value)}
              style={{ width: '320px', maxWidth: '100%' }}
            />
          </div>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Bill #</th>
                  <th>Date</th>
                  <th>Customer Details</th>
                  <th>Total Paid</th>
                  <th>Payment</th>
                  <th>Return Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingBills ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: '24px' }}>Loading customer records...</td></tr>
                ) : filteredBills.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#aaa' }}>No customer bills found. Create a bill in POS first!</td></tr>
                ) : (
                  filteredBills.map(bill => {
                    const billRets = branchReturns.filter(r => r.original_bill_id === bill.id);
                    return (
                      <tr key={bill.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{bill.id.slice(0, 8).toUpperCase()}</td>
                        <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(bill.created_at).toLocaleDateString('en-IN')}</td>
                        <td>
                          <strong>{bill.customer_name || 'Walk-in'}</strong>
                          {bill.customer_phone && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>📞 {bill.customer_phone}</div>}
                        </td>
                        <td style={{ fontWeight: 700 }}>₹{Number(bill.total_amount).toLocaleString('en-IN')}</td>
                        <td><span className="badge badge-secondary">{bill.payment_method}</span></td>
                        <td>
                          {billRets.length === 0 ? (
                            <span style={{ color: '#ccc' }}>—</span>
                          ) : (
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '4px 10px', fontSize: '11px', background: '#fff3cd', color: '#856404', border: '1px solid #ffeeba', fontWeight: 600 }}
                              onClick={() => setViewingReturnHistory({ bill, returns: billRets })}
                            >
                              ⚠️ Returned ({billRets.length})
                            </button>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '6px 12px', fontSize: '11px' }} 
                              onClick={() => handleViewBill(bill, billRets)}
                            >
                              👁️ View Bill
                            </button>
                            {billRets.length > 0 ? (
                              <span style={{ fontSize: '11px', color: '#999', fontStyle: 'italic' }}>🔒 Return Completed</span>
                            ) : (
                              <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '11px' }} onClick={() => selectBillForReturn(bill)}>
                                🔄 Return / Exchange
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div>
          <div className="card" style={{ marginBottom: '16px', background: '#faf8f5', border: '1px solid #C5A059' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Processing Return / Exchange for:</span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--dark)' }}>
                  {selectedBill.customer_name} {selectedBill.customer_phone ? `(${selectedBill.customer_phone})` : ''}
                </div>
              </div>
              <button className="btn btn-secondary" onClick={() => setSelectedBill(null)}>⬅️ Choose Different Customer</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {/* LEFT COLUMN: RETURNED ITEM */}
            <div className="card" style={{ margin: 0 }}>
              <div className="section-title">Step 1: Item Being Returned</div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>Select Item from Customer's Bill:</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  {(selectedBill.bill_items || []).map((bItem, i) => {
                    const prod = bItem.products || {};
                    const isSelected = returnedItem?.id === bItem.id;
                    return (
                      <div 
                        key={bItem.id || i}
                        onClick={() => setReturnedItem(bItem)}
                        style={{
                          padding: '12px', border: isSelected ? '2px solid #2ecc71' : '1px solid #ddd',
                          borderRadius: '4px', cursor: 'pointer', background: isSelected ? '#eafaf1' : '#fff',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--dark)' }}>{prod.category || 'Product'} ({prod.size || ''} {prod.color || ''})</div>
                          <div style={{ fontSize: '11px', color: '#666' }}>Design: #{prod.design_number} | Qty: {bItem.quantity}</div>
                        </div>
                        <div style={{ fontWeight: 700, color: '#e74c3c' }}>₹{bItem.price_at_sale}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {returnedItem && (
                <div style={{ borderTop: '1px dashed #ccc', paddingTop: '16px' }}>
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label>Reason for Return</label>
                    <select value={returnReason} onChange={e => setReturnReason(e.target.value)}>
                      <option value="Size Issue">📏 Wrong / Mismatched Size</option>
                      <option value="Color Exchange">🎨 Color / Style Preference</option>
                      <option value="Defective / Damaged">💔 Defective / Damaged (Log Loss)</option>
                      <option value="Other">📝 Other Reason...</option>
                    </select>
                  </div>
                  {returnReason === 'Other' && (
                    <div className="form-group">
                      <input type="text" placeholder="Enter reason..." value={customReason} onChange={e => setCustomReason(e.target.value)} />
                    </div>
                  )}
                  {returnReason === 'Defective / Damaged' && (
                    <div className="alert alert-danger" style={{ display: 'block', fontSize: '11px', padding: '8px' }}>
                      ⚠️ Item marked defective will NOT be returned to active inventory.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: NEW REPLACEMENT ITEM */}
            <div className="card" style={{ margin: 0 }}>
              <div className="section-title" style={{ fontSize: '14px' }}>Step 2: New Replacement Item <span style={{ fontSize: '11px', fontWeight: 400, color: '#888' }}>(Optional - Leave empty for Store Credit Return)</span></div>
              
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Scan Replacement Barcode</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text" 
                    placeholder="Scan or enter barcode..." 
                    value={exchangeBarcode}
                    onChange={e => setExchangeBarcode(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleScanNewItem()}
                  />
                  <button className="btn btn-primary" onClick={handleScanNewItem}>Add</button>
                </div>
              </div>

              {exchangedItem ? (
                <div style={{ padding: '16px', background: '#f8f9fa', border: '1px solid #ddd', borderRadius: '4px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span className="badge badge-green" style={{ marginBottom: '4px' }}>Replacement Selected</span>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--dark)' }}>{exchangedItem.category} ({exchangedItem.size} {exchangedItem.color})</div>
                      <div style={{ fontSize: '11px', color: '#666' }}>Design: #{exchangedItem.design_number} | Barcode: {exchangedItem.barcode}</div>
                    </div>
                    <button className="btn btn-danger" style={{ padding: '2px 8px', fontSize: '10px' }} onClick={() => setExchangedItem(null)}>✕ Remove</button>
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '18px', color: '#27ae60', marginTop: '8px' }}>
                    ₹{exchangedItem.selling_price}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px', border: '2px dashed #eee', borderRadius: '4px', color: '#999', marginBottom: '16px' }}>
                  No replacement item scanned. (Leave empty if customer is only returning for store credit).
                </div>
              )}

              {/* SETTLEMENT SECTION */}
              <div style={{ borderTop: '2px solid #333', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                  <span>Returned Value:</span>
                  <span>-₹{returnedItem ? (returnedItem.price_at_sale * returnedItem.quantity) : 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '12px' }}>
                  <span>Replacement Value:</span>
                  <span>+₹{exchangedItem ? exchangedItem.selling_price : 0}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eee', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>Net Difference Balance:</span>
                  <span style={{ fontWeight: 800, fontSize: '18px', color: netDiff > 0 ? '#e74c3c' : (netDiff < 0 ? '#2980b9' : '#27ae60') }}>
                    {netDiff > 0 ? `Customer Pays ₹${netDiff}` : (netDiff < 0 ? `Issue Credit Note ₹${Math.abs(netDiff)}` : '₹0 (Even Balance)')}
                  </span>
                </div>

                {netDiff < 0 && (
                  <div style={{ background: '#e8f4fd', padding: '12px', borderRadius: '4px', marginBottom: '16px', border: '1px solid #b8daff' }}>
                    <div style={{ fontWeight: 700, fontSize: '12px', color: '#004085', marginBottom: '8px' }}>💳 Credit Note Recipient (No Cash Refund):</div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <input type="text" placeholder="Customer Name" value={customerName} onChange={e => setCustomerName(e.target.value)} style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
                      <input type="text" placeholder="Phone Number (Required)" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
                    </div>
                  </div>
                )}

                {netDiff > 0 && (
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label>Collect Extra Payment Via</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                      <option value="Cash">💵 Cash</option>
                      <option value="UPI">📱 UPI / GPay / PhonePe</option>
                    </select>
                  </div>
                )}

                <button 
                  className="btn btn-primary" 
                  style={{ width: '100%', height: '46px', fontSize: '14px', fontWeight: 700 }}
                  onClick={handleConfirmExchange}
                  disabled={processing || !returnedItem}
                >
                  {processing ? 'Processing...' : '✔️ Confirm Return / Exchange'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT MODAL */}
      {completedExchange && (
        <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: '420px', maxWidth: '95%', margin: 0, padding: '24px' }}>
            <div className="exchange-slip-preview" style={{ fontFamily: 'Montserrat, sans-serif', color: '#000' }}>
              <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '12px', marginBottom: '12px' }}>
                <img src="/images/logo%20black.png" alt="Kiddorin Logo" style={{ maxWidth: '160px', maxHeight: '55px', objectFit: 'contain', display: 'block', margin: '0 auto 8px auto' }} />
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>{completedExchange.netAmount < 0 ? 'Store Credit Note (Voucher)' : 'Customer Exchange Note'}</div>
                <div style={{ fontSize: '11px', marginTop: '4px' }}>Slip No: {completedExchange.id.slice(0, 8).toUpperCase()}</div>
                <div style={{ fontSize: '10px', color: '#555' }}>Date: {completedExchange.date}</div>
              </div>

              <div style={{ fontSize: '12px', marginBottom: '12px' }}>
                <strong>Customer:</strong> {completedExchange.customerName} {completedExchange.customerPhone ? `(${completedExchange.customerPhone})` : ''}
              </div>

              <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', marginBottom: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #000' }}>
                    <th style={{ textAlign: 'left', padding: '4px 0' }}>Description</th>
                    <th style={{ textAlign: 'right', padding: '4px 0' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '6px 0' }}>
                      <span style={{ color: '#e74c3c', fontWeight: 600 }}>RETURNED:</span> {completedExchange.returnedItem?.products?.category} ({completedExchange.returnedItem?.products?.size})
                      <div style={{ fontSize: '9px', color: '#666' }}>Reason: {completedExchange.returnReason}</div>
                    </td>
                    <td style={{ textAlign: 'right', color: '#e74c3c' }}>-₹{completedExchange.returnedItem?.price_at_sale}</td>
                  </tr>
                  {completedExchange.exchangedItem && (
                    <tr>
                      <td style={{ padding: '6px 0' }}>
                        <span style={{ color: '#27ae60', fontWeight: 600 }}>ISSUED:</span> {completedExchange.exchangedItem.category} ({completedExchange.exchangedItem.size})
                      </td>
                      <td style={{ textAlign: 'right', color: '#27ae60' }}>+₹{completedExchange.exchangedItem.selling_price}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div style={{ borderTop: '1px solid #000', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>
                <span>Net Settled:</span>
                <span>{completedExchange.netAmount > 0 ? `Paid ₹${completedExchange.netAmount} (${completedExchange.paymentMethod})` : `Credit ₹${Math.abs(completedExchange.netAmount)}`}</span>
              </div>

              <div style={{ textAlign: 'center', fontSize: '9px', color: '#666' }}>
                Thank you for shopping with Kiddorin!<br/>Exchanged goods are non-refundable.
                <div style={{ marginTop: '4px', fontWeight: '600', color: '#000' }}>Follow us on Instagram @Kiddorin</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { toast.dismiss(); window.print(); }}>🖨️ Print Receipt</button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setCompletedExchange(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* RETURN HISTORY MODAL */}
      {viewingReturnHistory && (
        <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: '520px', maxWidth: '95%', margin: 0, padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--dark)' }}>Return History for Bill #{viewingReturnHistory.bill.id.slice(0,8).toUpperCase()}</div>
                <div style={{ fontSize: '12px', color: '#666' }}>Customer: {viewingReturnHistory.bill.customer_name || 'Walk-in'}</div>
              </div>
              <button className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setViewingReturnHistory(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {viewingReturnHistory.returns.map((ret, idx) => {
                const bItems = viewingReturnHistory.bill.bill_items || [];
                const matchItem = bItems.find(bi => bi.product_id === ret.returned_product_id || bi.products?.id === ret.returned_product_id);
                const prodInfo = matchItem?.products ? `${matchItem.products.category} (${matchItem.products.size} ${matchItem.products.color})` : `ID #${(ret.returned_product_id||'').slice(0,8)}`;
                
                return (
                  <div key={ret.id || idx} style={{ padding: '14px', background: '#faf8f5', border: '1px solid #ddd', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '8px', color: '#666' }}>
                      <span>📅 {new Date(ret.created_at).toLocaleString('en-IN')}</span>
                      <span className="badge badge-secondary">{ret.return_reason}</span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#e74c3c' }}>
                      🔄 Returned: {prodInfo} (Qty: {ret.returned_qty})
                    </div>
                    {ret.exchanged_product_id && (
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#27ae60', marginTop: '4px' }}>
                        🎁 Replacement Issued (ID #{ret.exchanged_product_id.slice(0,8)})
                      </div>
                    )}
                    <div style={{ borderTop: '1px dashed #ccc', marginTop: '10px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '13px' }}>
                      <span>Settlement:</span>
                      <span style={{ color: ret.net_amount < 0 ? '#2980b9' : '#27ae60' }}>
                        {ret.net_amount < 0 ? `Credit Voucher Issued ₹${Math.abs(ret.net_amount)}` : `Paid Extra ₹${ret.net_amount}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <button className="btn btn-primary" style={{ width: '100%', marginTop: '20px' }} onClick={() => setViewingReturnHistory(null)}>Close</button>
          </div>
        </div>
      )}

      {/* BILL PREVIEW MODAL */}
      {viewingBillPreview && (
        <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: '420px', maxWidth: '95%', margin: 0, padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            {viewingBillPreview.type === 'sale' ? (
              <div className="exchange-slip-preview" style={{ fontFamily: 'Montserrat, sans-serif', color: '#000' }}>
                <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '12px', marginBottom: '12px' }}>
                  <img src="/images/logo%20black.png" alt="Kiddorin Logo" style={{ maxWidth: '160px', maxHeight: '55px', objectFit: 'contain', display: 'block', margin: '0 auto 8px auto' }} />
                  <div style={{ fontSize: '10px', lineHeight: '1.4', marginBottom: '8px', color: '#444' }}>
                    G-69 , The Boulevard , Nr. Pratham Circle, Green City Road, Pal, Surat, Gujarat 395009
                  </div>
                  <div style={{ fontSize: '10px', fontWeight: '600', marginBottom: '8px' }}>
                    +91 94283 96273 | +91 94276 56615
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', borderTop: '1px dashed #000', paddingTop: '8px' }}>Original Sale Bill</div>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>Bill No: {viewingBillPreview.id.slice(0, 8).toUpperCase()}</div>
                  <div style={{ fontSize: '10px', color: '#555' }}>Date: {viewingBillPreview.date}</div>
                </div>

                <div style={{ fontSize: '12px', marginBottom: '12px' }}>
                  <strong>Customer:</strong> {viewingBillPreview.customerName} {viewingBillPreview.customerPhone ? `(${viewingBillPreview.customerPhone})` : ''}<br/>
                  <strong>Payment:</strong> {viewingBillPreview.payment.toUpperCase()}
                </div>

                <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', marginBottom: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #000', borderTop: '1px solid #000' }}>
                      <th style={{ textAlign: 'left', padding: '6px 0' }}>Item</th>
                      <th style={{ textAlign: 'center', padding: '6px 0' }}>Qty</th>
                      <th style={{ textAlign: 'right', padding: '6px 0' }}>Price</th>
                      <th style={{ textAlign: 'right', padding: '6px 0' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingBillPreview.items.map((item, idx) => {
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
                        <tr key={idx} style={{ borderBottom: '1px dashed #eee' }}>
                          <td style={{ padding: '6px 0' }}>
                            <div style={{ fontWeight: '700' }}>{item.design || '#'}</div>
                            <div style={{ fontSize: '10px', color: '#555' }}>{catText} {item.color ? `| ${item.color}` : ''} {item.size ? `| ${item.size}` : ''}</div>
                          </td>
                          <td style={{ textAlign: 'center' }}>{item.qty}</td>
                          <td style={{ textAlign: 'right' }}>₹{item.price}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{item.price * item.qty}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div style={{ borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '8px 0', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>
                  <span>Total Amount:</span>
                  <span>₹{viewingBillPreview.total.toLocaleString('en-IN')}</span>
                </div>

                <div style={{ textAlign: 'center', fontSize: '9px', color: '#666' }}>
                  Thank you for shopping with us!<br/>No Return | No Exchange
                  <div style={{ marginTop: '4px', fontWeight: '600', color: '#000' }}>Follow us on Instagram @Kiddorin</div>
                </div>
              </div>
            ) : (
              <div className="exchange-slip-preview" style={{ fontFamily: 'Montserrat, sans-serif', color: '#000' }}>
                <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '12px', marginBottom: '12px' }}>
                  <img src="/images/logo%20black.png" alt="Kiddorin Logo" style={{ maxWidth: '160px', maxHeight: '55px', objectFit: 'contain', display: 'block', margin: '0 auto 8px auto' }} />
                  <div style={{ fontSize: '10px', lineHeight: '1.4', marginBottom: '8px', color: '#444' }}>
                    G-69 , The Boulevard , Nr. Pratham Circle, Green City Road, Pal, Surat, Gujarat 395009
                  </div>
                  <div style={{ fontSize: '10px', fontWeight: '600', marginBottom: '8px' }}>
                    +91 94283 96273 | +91 94276 56615
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', borderTop: '1px dashed #000', paddingTop: '8px' }}>{viewingBillPreview.netAmount < 0 ? 'Store Credit Note (Voucher)' : 'Customer Exchange Note'}</div>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>Slip No: {viewingBillPreview.id.slice(0, 8).toUpperCase()}</div>
                  <div style={{ fontSize: '10px', color: '#555' }}>Date: {viewingBillPreview.date}</div>
                </div>

                <div style={{ fontSize: '12px', marginBottom: '12px' }}>
                  <strong>Customer:</strong> {viewingBillPreview.customerName} {viewingBillPreview.customerPhone ? `(${viewingBillPreview.customerPhone})` : ''}
                </div>

                <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', marginBottom: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #000' }}>
                      <th style={{ textAlign: 'left', padding: '4px 0' }}>Description</th>
                      <th style={{ textAlign: 'right', padding: '4px 0' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                        <div style={{ fontWeight: 700 }}>RETURNED</div>
                        <div>{viewingBillPreview.returnedItem?.products?.category} ({viewingBillPreview.returnedItem?.products?.size})</div>
                        <div style={{ fontSize: '9px', color: '#666' }}>Reason: {viewingBillPreview.returnReason}</div>
                      </td>
                      <td style={{ textAlign: 'right', color: '#e74c3c' }}>-₹{viewingBillPreview.returnedItem?.price_at_sale}</td>
                    </tr>
                    {viewingBillPreview.exchangedItem && (
                      <tr>
                        <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                          <div style={{ fontWeight: 700 }}>ISSUED</div>
                          <div>{viewingBillPreview.exchangedItem.category} ({viewingBillPreview.exchangedItem.size})</div>
                        </td>
                        <td style={{ textAlign: 'right', color: '#27ae60' }}>+₹{viewingBillPreview.exchangedItem.selling_price}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div style={{ borderTop: '1px solid #000', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>
                  <span>Net Settled:</span>
                  <span>{viewingBillPreview.netAmount > 0 ? `Paid ₹${viewingBillPreview.netAmount} (${viewingBillPreview.paymentMethod})` : `Credit ₹${Math.abs(viewingBillPreview.netAmount)}`}</span>
                </div>

                <div style={{ textAlign: 'center', fontSize: '9px', color: '#666' }}>
                  Thank you for shopping with Kiddorin!<br/>Exchanged goods are non-refundable.
                  <div style={{ marginTop: '4px', fontWeight: '600', color: '#000' }}>Follow us on Instagram @Kiddorin</div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { toast.dismiss(); window.print(); }}>🖨️ Print Receipt</button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setViewingBillPreview(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Thermal Print Slip Component */}
      {(completedExchange || viewingBillPreview) && (() => {
        const printData = completedExchange ? {
          type: 'return',
          ...completedExchange
        } : viewingBillPreview;

        if (printData.type === 'sale') {
          return (
            <div id="exchange-print-slip" className="print-bill-container">
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
                <div><strong>Date:</strong> {printData.date}</div>
                <div><strong>Bill No:</strong> {printData.id.slice(0, 8).toUpperCase()}</div>
                {printData.customerPhone ? (
                  <div><strong>Customer:</strong> {printData.customerName} ({printData.customerPhone})</div>
                ) : (
                  <div><strong>Customer:</strong> {printData.customerName}</div>
                )}
                <div><strong>Payment:</strong> {printData.payment.toUpperCase()}</div>
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
                  {printData.items.map((item, idx) => {
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>Total Amount:</span>
                  <span>₹{printData.total.toLocaleString('en-IN')}</span>
                </div>
              </div>
              <div className="pb-footer">
                <div>Thank you for shopping with us!</div>
                <div>No Return | No Exchange</div>
                <div style={{ marginTop: '4px', fontWeight: '600' }}>Follow us on Instagram @Kiddorin</div>
              </div>
            </div>
          );
        } else {
          return (
            <div id="exchange-print-slip" className="print-bill-container">
              <div className="pb-header">
                <img src="/images/logo%20black.png" alt="Kiddorin Logo" style={{ maxWidth: '180px', maxHeight: '65px', objectFit: 'contain', display: 'block', margin: '0 auto 12px auto' }} />
                <div style={{ fontSize: '10px', lineHeight: '1.4', marginBottom: '12px' }}>
                  G-69 , The Boulevard , Nr. Pratham Circle, Green City Road, Pal, Surat, Gujarat 395009
                </div>
                <div style={{ fontSize: '10px', fontWeight: '600', marginBottom: '8px' }}>
                  +91 94283 96273 | +91 94276 56615
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', borderTop: '1px dashed #000', paddingTop: '8px' }}>
                  {printData.netAmount < 0 ? 'Store Credit Note (Voucher)' : 'Customer Exchange Note'}
                </div>
              </div>
              <div className="pb-details">
                <div><strong>Date:</strong> {printData.date}</div>
                <div><strong>Slip No:</strong> {printData.id.slice(0, 8).toUpperCase()}</div>
                <div><strong>Customer:</strong> {printData.customerName} {printData.customerPhone ? `(${printData.customerPhone})` : ''}</div>
              </div>
              <table className="pb-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                      <div style={{ fontWeight: 700 }}>RETURNED</div>
                      <div>{printData.returnedItem?.products?.category} ({printData.returnedItem?.products?.size})</div>
                      <div style={{ fontSize: '9px', color: '#444' }}>Reason: {printData.returnReason}</div>
                    </td>
                    <td style={{ textAlign: 'right' }}>-₹{printData.returnedItem?.price_at_sale}</td>
                  </tr>
                  {printData.exchangedItem && (
                    <tr>
                      <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                        <div style={{ fontWeight: 700 }}>ISSUED</div>
                        <div>{printData.exchangedItem.category} ({printData.exchangedItem.size})</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>+₹{printData.exchangedItem.selling_price}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="pb-total">
                <span>Net Settled:</span>
                <span>{printData.netAmount > 0 ? `Paid ₹${printData.netAmount} (${printData.paymentMethod})` : `Credit ₹${Math.abs(printData.netAmount)}`}</span>
              </div>
              <div className="pb-footer">
                <div>Thank you for shopping with Kiddorin!</div>
                <div>Exchanged goods are non-refundable.</div>
                <div style={{ marginTop: '4px', fontWeight: '600' }}>Follow us on Instagram @Kiddorin</div>
              </div>
            </div>
          );
        }
      })()}
    </div>
  );
};

export default Exchanges;
