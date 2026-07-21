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
  const [selectedReturnItems, setSelectedReturnItems] = useState({}); // { bill_item_id: { qty, reason, customReason } }
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Exchange state
  const [exchangeBarcode, setExchangeBarcode] = useState('');
  const [exchangedItems, setExchangedItems] = useState([]); // Array of { product, qty }
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [splitCash, setSplitCash] = useState('');
  const [processing, setProcessing] = useState(false);

  // Discount state
  const [discountValue, setDiscountValue] = useState('');
  const [discountType, setDiscountType] = useState('amount');

  // Receipt modal
  const [completedExchange, setCompletedExchange] = useState(null);
  const [branchReturns, setBranchReturns] = useState([]);
  const [viewingReturnHistory, setViewingReturnHistory] = useState(null);
  const [viewingBillPreview, setViewingBillPreview] = useState(null);
  const [deleteBillItem, setDeleteBillItem] = useState(null);
  const [deleteReturnItem, setDeleteReturnItem] = useState(null);

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
    setSelectedReturnItems({});
    setExchangedItems([]);
    setExchangeBarcode('');
    setDiscountValue('');
    setDiscountType('amount');
  };

  const handleViewBill = (bill, billRets) => {
    if (billRets && billRets.length > 0) {
      const latestRet = billRets[0];
      const latestTime = new Date(latestRet.created_at).getTime();
      const groupRets = billRets.filter(r => Math.abs(new Date(r.created_at).getTime() - latestTime) < 5000);

      const returnsList = groupRets.map(ret => {
        const bItem = (bill.bill_items || []).find(bi => bi.product_id === ret.returned_product_id || bi.products?.id === ret.returned_product_id);
        return {
          qty: ret.returned_qty,
          price: Number(bItem?.price_at_sale || 0),
          reason: ret.return_reason,
          products: bItem?.products || { category: 'Product', size: '', color: '', design_number: '' }
        };
      }).filter(r => r.qty > 0);

      const exchangesList = groupRets.map(ret => {
        if (!ret.exchanged_product_id) return null;
        return {
          qty: ret.exchanged_qty,
          product: ret.exchanged_product || { category: 'Product', size: '', color: '', design_number: '', selling_price: 0 }
        };
      }).filter(Boolean);

      const totalNet = groupRets.reduce((sum, r) => sum + Number(r.net_amount || 0), 0);
      const totalDiscount = groupRets.reduce((sum, r) => sum + Number(r.discount || 0), 0);

      setViewingBillPreview({
        type: 'return',
        id: latestRet.id || 'RET-' + bill.id,
        date: new Date(latestRet.created_at).toLocaleString('en-IN'),
        customerName: latestRet.customer_name || bill.customer_name || 'Walk-in Customer',
        customerPhone: latestRet.customer_phone || bill.customer_phone || '',
        returns: returnsList,
        exchanges: exchangesList,
        netAmount: totalNet - totalDiscount,
        discount: totalDiscount,
        paymentMethod: latestRet.payment_method || 'Store Credit Note',
        originalBill: bill
      });
    } else {
      const subtotal = (bill.bill_items || []).reduce((sum, bi) => sum + Number(bi.price_at_sale || 0) * bi.quantity, 0);
      const discount = Math.max(0, subtotal - Number(bill.total_amount || 0));
      setViewingBillPreview({
        type: 'sale',
        id: bill.id,
        date: new Date(bill.created_at).toLocaleString('en-IN'),
        customerName: bill.customer_name || 'Walk-in Customer',
        customerPhone: bill.customer_phone || '',
        payment: bill.payment_method || 'Cash',
        subtotal: subtotal,
        discount: discount,
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

      const existingIndex = exchangedItems.findIndex(item => item.product.id === prod.id);
      if (existingIndex !== -1) {
        const newExchanged = [...exchangedItems];
        const currentQty = newExchanged[existingIndex].qty;
        if (currentQty + 1 > prod.quantity) {
          throw new Error(`Only ${prod.quantity} pieces in stock for this replacement item.`);
        }
        newExchanged[existingIndex].qty += 1;
        setExchangedItems(newExchanged);
      } else {
        if (prod.quantity < 1) {
          throw new Error("Product Out of Stock!");
        }
        setExchangedItems([...exchangedItems, { product: prod, qty: 1 }]);
      }
      setExchangeBarcode('');
      toast.success('Added replacement item!');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const updateExchangeQty = (index, delta) => {
    const updated = [...exchangedItems];
    const item = updated[index];
    const newQty = item.qty + delta;
    if (newQty < 1) return;
    if (newQty > item.product.quantity) {
      toast.error(`Only ${item.product.quantity} pieces in stock!`);
      return;
    }
    updated[index].qty = newQty;
    setExchangedItems(updated);
  };

  const removeExchangeItem = (index) => {
    setExchangedItems(exchangedItems.filter((_, i) => i !== index));
  };

  const totalReturnedValue = Object.keys(selectedReturnItems).reduce((sum, itemId) => {
    const bItem = (selectedBill?.bill_items || []).find(bi => bi.id === itemId);
    if (!bItem) return sum;
    const details = selectedReturnItems[itemId];
    return sum + (Number(bItem.price_at_sale) * details.qty);
  }, 0);

  const totalExchangedValue = exchangedItems.reduce((sum, item) => {
    return sum + (Number(item.product.selling_price) * item.qty);
  }, 0);

  let discountAmount = 0;
  let discountPercent = 0;
  if (discountValue && !isNaN(discountValue) && parseFloat(discountValue) > 0 && totalExchangedValue > 0) {
    const val = parseFloat(discountValue);
    if (discountType === 'percent') {
      discountPercent = Math.min(val, 100);
      discountAmount = Math.round((totalExchangedValue * discountPercent) / 100);
    } else {
      discountAmount = Math.min(val, totalExchangedValue);
      discountPercent = parseFloat(((discountAmount / totalExchangedValue) * 100).toFixed(2));
    }
  }

  const netDiff = totalExchangedValue - totalReturnedValue - discountAmount;

  const handleConfirmExchange = async () => {
    const returnKeys = Object.keys(selectedReturnItems);
    if (returnKeys.length === 0) {
      toast.error('Select at least one item being returned');
      return;
    }
    if (netDiff < 0 && !customerPhone.trim()) {
      toast.error('Please enter Customer Phone Number to save Store Credit balance.');
      return;
    }
    setProcessing(true);
    try {
      const returnsPayload = returnKeys.map(itemId => {
        const bItem = selectedBill.bill_items.find(bi => bi.id === itemId);
        const details = selectedReturnItems[itemId];
        return {
          product_id: bItem.product_id,
          qty: details.qty,
          price: Number(bItem.price_at_sale || 0),
          reason: details.reason === 'Other' ? details.customReason : details.reason
        };
      });

      const exchangesPayload = exchangedItems.map(item => ({
        product_id: item.product.id,
        qty: item.qty,
        price: Number(item.product.selling_price || 0)
      }));

      const sCashAmt = parseFloat(splitCash) || 0;
      const sUpiAmt = Math.max(0, netDiff - sCashAmt);
      const finalPayMethod = paymentMethod === 'Split' ? `Split (Cash: ₹${sCashAmt}, UPI: ₹${sUpiAmt})` : paymentMethod;

      const payload = {
        branch_id: user.branch_id,
        original_bill_id: selectedBill?.id || null,
        customer_name: customerName.trim() || selectedBill?.customer_name || 'Walk-in Customer',
        customer_phone: customerPhone.trim() || selectedBill?.customer_phone || null,
        returns: returnsPayload,
        exchanges: exchangesPayload,
        overall_net_amount: netDiff,
        discount: discountAmount,
        payment_method: netDiff > 0 ? finalPayMethod : (netDiff < 0 ? 'Store Credit Note' : 'Even Exchange')
      };

      const result = await db.processMultipleExchange(payload);
      toast.success('Exchange processed successfully!');

      setCompletedExchange({
        id: result?.id || 'EX-' + Math.floor(Math.random() * 10000),
        date: new Date().toLocaleString('en-IN'),
        customerName: customerName.trim() || selectedBill?.customer_name || 'Walk-in Customer',
        customerPhone: customerPhone.trim() || selectedBill?.customer_phone || '',
        returns: returnsPayload.map(r => {
          const bItem = selectedBill.bill_items.find(bi => bi.product_id === r.product_id);
          return {
            ...r,
            products: bItem?.products || { category: 'Product', size: '', color: '', design_number: '' }
          };
        }),
        exchanges: exchangedItems.map(item => ({
          product: item.product,
          qty: item.qty
        })),
        netAmount: netDiff,
        discount: discountAmount,
        paymentMethod: netDiff > 0 ? finalPayMethod : 'Store Credit Note',
        originalBill: selectedBill
      });

      // reset inputs
      setSelectedBill(null);
      setSelectedReturnItems({});
      setExchangedItems([]);
      setExchangeBarcode('');
      setSplitCash('');
      setDiscountValue('');
      setDiscountType('amount');
      loadBills();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

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
                            <button
                              className="btn btn-secondary"
                              title="Delete Bill"
                              style={{ padding: '6px 10px', fontSize: '13px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
                              onClick={() => setDeleteBillItem(bill)}
                            >
                              🗑️
                            </button>
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
              <div className="section-title">Step 1: Items Being Returned</div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>Select Item(s) from Customer's Bill:</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  {(selectedBill.bill_items || []).map((bItem, i) => {
                    const prod = bItem.products || {};
                    const selectedInfo = selectedReturnItems[bItem.id];
                    const isSelected = !!selectedInfo;
                    return (
                      <div
                        key={bItem.id || i}
                        style={{
                          padding: '12px', border: isSelected ? '2px solid #2ecc71' : '1px solid #ddd',
                          borderRadius: '4px', background: isSelected ? '#eafaf1' : '#fff',
                          display: 'flex', flexDirection: 'column', gap: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, width: '100%' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                if (isSelected) {
                                  const updated = { ...selectedReturnItems };
                                  delete updated[bItem.id];
                                  setSelectedReturnItems(updated);
                                } else {
                                  setSelectedReturnItems({
                                    ...selectedReturnItems,
                                    [bItem.id]: { qty: 1, reason: 'Size Issue', customReason: '' }
                                  });
                                }
                              }}
                              style={{ width: '16px', height: '16px' }}
                            />
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--dark)' }}>{prod.category || 'Product'} ({prod.size || ''} {prod.color || ''})</div>
                              <div style={{ fontSize: '11px', color: '#666' }}>Design: #{prod.design_number} | Bill Qty: {bItem.quantity}</div>
                            </div>
                          </label>
                          <div style={{ fontWeight: 700, color: '#e74c3c' }}>₹{bItem.price_at_sale}</div>
                        </div>

                        {isSelected && (
                          <div style={{ borderTop: '1px dashed #ccc', paddingTop: '8px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 600 }}>Qty to Return:</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '2px 8px', minWidth: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  onClick={() => {
                                    if (selectedInfo.qty > 1) {
                                      setSelectedReturnItems({
                                        ...selectedReturnItems,
                                        [bItem.id]: { ...selectedInfo, qty: selectedInfo.qty - 1 }
                                      });
                                    }
                                  }}
                                  disabled={selectedInfo.qty <= 1}
                                >
                                  -
                                </button>
                                <span style={{ fontWeight: 'bold', width: '20px', textAlign: 'center' }}>{selectedInfo.qty}</span>
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '2px 8px', minWidth: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  onClick={() => {
                                    if (selectedInfo.qty < bItem.quantity) {
                                      setSelectedReturnItems({
                                        ...selectedReturnItems,
                                        [bItem.id]: { ...selectedInfo, qty: selectedInfo.qty + 1 }
                                      });
                                    } else {
                                      toast.error(`Cannot return more than purchased quantity (${bItem.quantity})`);
                                    }
                                  }}
                                  disabled={selectedInfo.qty >= bItem.quantity}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label style={{ fontSize: '11px', margin: 0 }}>Reason for Return</label>
                              <select
                                value={selectedInfo.reason}
                                onChange={e => setSelectedReturnItems({
                                  ...selectedReturnItems,
                                  [bItem.id]: { ...selectedInfo, reason: e.target.value }
                                })}
                                style={{ padding: '6px', fontSize: '12px', width: '100%' }}
                              >
                                <option value="Size Issue">📏 Wrong / Mismatched Size</option>
                                <option value="Color Exchange">🎨 Color / Style Preference</option>
                                <option value="Defective / Damaged">💔 Defective / Damaged (Log Loss)</option>
                                <option value="Other">📝 Other Reason...</option>
                              </select>
                            </div>
                            {selectedInfo.reason === 'Other' && (
                              <div className="form-group" style={{ margin: 0 }}>
                                <input
                                  type="text"
                                  placeholder="Enter reason..."
                                  value={selectedInfo.customReason || ''}
                                  onChange={e => setSelectedReturnItems({
                                    ...selectedReturnItems,
                                    [bItem.id]: { ...selectedInfo, customReason: e.target.value }
                                  })}
                                  style={{ padding: '6px', fontSize: '12px' }}
                                />
                              </div>
                            )}
                            {selectedInfo.reason === 'Defective / Damaged' && (
                              <div className="alert alert-danger" style={{ display: 'block', fontSize: '10px', padding: '6px', margin: 0 }}>
                                ⚠️ Marked defective: will NOT return to active stock.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: NEW REPLACEMENT ITEM */}
            <div className="card" style={{ margin: 0 }}>
              <div className="section-title" style={{ fontSize: '14px' }}>Step 2: New Replacement Item(s) <span style={{ fontSize: '11px', fontWeight: 400, color: '#888' }}>(Optional - Leave empty for Store Credit)</span></div>

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

              {exchangedItems.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                  {exchangedItems.map((item, index) => (
                    <div key={item.product.id} style={{ padding: '12px', background: '#f8f9fa', border: '1px solid #ddd', borderRadius: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--dark)' }}>{item.product.category} ({item.product.size} {item.product.color})</div>
                          <div style={{ fontSize: '11px', color: '#666' }}>Design: #{item.product.design_number} | Stock: {item.product.quantity}</div>
                        </div>
                        <button className="btn btn-danger" style={{ padding: '2px 8px', fontSize: '10px' }} onClick={() => removeExchangeItem(index)}>✕ Remove</button>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '2px 8px', minWidth: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => updateExchangeQty(index, -1)}
                            disabled={item.qty <= 1}
                          >
                            -
                          </button>
                          <span style={{ fontWeight: 'bold', width: '20px', textAlign: 'center' }}>{item.qty}</span>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '2px 8px', minWidth: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => updateExchangeQty(index, 1)}
                            disabled={item.qty >= item.product.quantity}
                          >
                            +
                          </button>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '16px', color: '#27ae60' }}>
                          ₹{item.product.selling_price * item.qty}
                        </div>
                      </div>
                    </div>
                  ))}
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
                  <span>-₹{totalReturnedValue}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '12px' }}>
                  <span>Replacement Value:</span>
                  <span>+₹{totalExchangedValue}</span>
                </div>

                {exchangedItems.length > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)', marginBottom: '12px' }}>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0 12px', color: 'var(--success)', fontWeight: 600, fontSize: '13px' }}>
                        <span>DISCOUNT APPLIED</span>
                        <span>-₹{discountAmount.toLocaleString('en-IN')} ({discountPercent}%)</span>
                      </div>
                    )}
                  </>
                )}

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
                    <select value={paymentMethod} onChange={e => {
                      setPaymentMethod(e.target.value);
                      if (e.target.value === 'Split') setSplitCash(Math.round(netDiff / 2).toString());
                    }}>
                      <option value="Cash">💵 Cash</option>
                      <option value="UPI">📱 UPI / GPay / PhonePe</option>
                      <option value="Split">⚖️ Split (Cash + UPI)</option>
                    </select>
                    {paymentMethod === 'Split' && (
                      <div style={{ marginTop: '12px', padding: '12px', background: 'var(--off-white)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--dark)', marginBottom: '8px' }}>⚖️ Split Breakdown (Total to Pay: ₹{netDiff})</div>
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
                              value={Math.max(0, netDiff - (parseFloat(splitCash) || 0))}
                              readOnly
                              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', background: '#e9ecef', fontWeight: 'bold', color: '#004085' }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  className="btn btn-primary"
                  style={{ width: '100%', height: '46px', fontSize: '14px', fontWeight: 700 }}
                  onClick={handleConfirmExchange}
                  disabled={processing || Object.keys(selectedReturnItems).length === 0}
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                  {(completedExchange.returns || []).map((ret, rIdx) => (
                    <tr key={`ret-${rIdx}`}>
                      <td style={{ padding: '6px 0' }}>
                        <span style={{ color: '#e74c3c', fontWeight: 600 }}>RETURNED:</span> {ret.products?.category} ({ret.products?.size} {ret.products?.color}) x {ret.qty}
                        {ret.products?.design_number && (
                          <div style={{ fontSize: '9px', color: '#555', marginTop: '2px' }}>Design: #{ret.products.design_number}</div>
                        )}
                        <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>Reason: {ret.reason}</div>
                      </td>
                      <td style={{ textAlign: 'right', color: '#e74c3c' }}>-₹{ret.price * ret.qty}</td>
                    </tr>
                  ))}
                  {(completedExchange.exchanges || []).map((ex, eIdx) => (
                    <tr key={`ex-${eIdx}`}>
                      <td style={{ padding: '6px 0' }}>
                        <span style={{ color: '#27ae60', fontWeight: 600 }}>ISSUED:</span> {ex.product.category} ({ex.product.size} {ex.product.color}) x {ex.qty}
                        {ex.product.design_number && (
                          <div style={{ fontSize: '9px', color: '#555', marginTop: '2px' }}>Design: #{ex.product.design_number}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', color: '#27ae60' }}>+₹{ex.product.selling_price * ex.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {completedExchange.originalBill && (
                <div className="no-print" style={{ background: '#fcfcfc', border: '1px solid #ddd', padding: '8px', borderRadius: '4px', marginBottom: '12px', fontSize: '10px' }}>
                  <div style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#666', borderBottom: '1px solid #eee', paddingBottom: '4px', marginBottom: '6px' }}>
                    📄 Original Bill Details (Before Return)
                  </div>
                  <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px dashed #ccc', color: '#666' }}>
                        <th style={{ textAlign: 'left', padding: '2px 0' }}>Item</th>
                        <th style={{ textAlign: 'center', padding: '2px 0' }}>Qty</th>
                        <th style={{ textAlign: 'right', padding: '2px 0' }}>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(completedExchange.originalBill.bill_items || []).map((bi, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f9f9f9' }}>
                          <td style={{ padding: '3px 0' }}>
                            {bi.products?.category} ({bi.products?.size} {bi.products?.color})
                            {bi.products?.design_number && <div style={{ fontSize: '8px', color: '#777' }}>#{bi.products.design_number}</div>}
                          </td>
                          <td style={{ textAlign: 'center', padding: '3px 0' }}>{bi.quantity}</td>
                          <td style={{ textAlign: 'right', padding: '3px 0' }}>₹{bi.price_at_sale}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ borderTop: '1px dashed #ccc', marginTop: '6px', paddingTop: '6px', fontSize: '10px', color: '#555', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Subtotal:</span>
                      <span>₹{(() => {
                        const sub = (completedExchange.originalBill.bill_items || []).reduce((s, bi) => s + Number(bi.price_at_sale) * bi.quantity, 0);
                        return sub.toLocaleString('en-IN');
                      })()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Discount Given:</span>
                      <span>-₹{(() => {
                        const sub = (completedExchange.originalBill.bill_items || []).reduce((s, bi) => s + Number(bi.price_at_sale) * bi.quantity, 0);
                        const disc = Math.max(0, sub - Number(completedExchange.originalBill.total_amount || 0));
                        return disc.toLocaleString('en-IN');
                      })()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#000', marginTop: '2px' }}>
                      <span>Paid Total:</span>
                      <span>₹{Number(completedExchange.originalBill.total_amount).toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>
              )}

              {completedExchange.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingBottom: '4px', color: '#666' }}>
                  <span>Subtotal:</span>
                  <span>₹{(completedExchange.netAmount + completedExchange.discount).toLocaleString('en-IN')}</span>
                </div>
              )}
              {completedExchange.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingBottom: '4px', color: 'var(--success)', fontWeight: 600 }}>
                  <span>Discount:</span>
                  <span>-₹{completedExchange.discount.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div style={{ borderTop: '1px solid #000', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>
                <span>Net Settled:</span>
                <span>{completedExchange.netAmount > 0 ? `Paid ₹${completedExchange.netAmount} (${completedExchange.paymentMethod})` : `Credit ₹${Math.abs(completedExchange.netAmount)}`}</span>
              </div>

              <div style={{ textAlign: 'center', fontSize: '9px', color: '#666' }}>
                Thank you for shopping with Kiddorin!<br />Exchanged goods are non-refundable.
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: '520px', maxWidth: '95%', margin: 0, padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--dark)' }}>Return History for Bill #{viewingReturnHistory.bill.id.slice(0, 8).toUpperCase()}</div>
                <div style={{ fontSize: '12px', color: '#666' }}>Customer: {viewingReturnHistory.bill.customer_name || 'Walk-in'}</div>
              </div>
              <button className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setViewingReturnHistory(null)}>✕</button>
            </div>

            {/* Original Bill Info in Return History */}
            <div style={{ background: '#fcfcfc', border: '1px solid #ddd', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#666', borderBottom: '1px solid #eee', paddingBottom: '6px', marginBottom: '8px' }}>
                📄 Original Bill Details (Before Return)
              </div>
              <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px dashed #ccc', color: '#666' }}>
                    <th style={{ textAlign: 'left', padding: '2px 0' }}>Item</th>
                    <th style={{ textAlign: 'center', padding: '2px 0' }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '2px 0' }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewingReturnHistory.bill.bill_items || []).map((bi, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f9f9f9' }}>
                      <td style={{ padding: '6px 0' }}>
                        {bi.products?.category} ({bi.products?.size} {bi.products?.color})
                        {bi.products?.design_number && <div style={{ fontSize: '10px', color: '#777' }}>#{bi.products.design_number}</div>}
                      </td>
                      <td style={{ textAlign: 'center', padding: '6px 0' }}>{bi.quantity}</td>
                      <td style={{ textAlign: 'right', padding: '6px 0' }}>₹{bi.price_at_sale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ borderTop: '1px dashed #ccc', marginTop: '8px', paddingTop: '8px', fontSize: '12px', color: '#555', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal:</span>
                  <span>₹{(() => {
                    const sub = (viewingReturnHistory.bill.bill_items || []).reduce((s, bi) => s + Number(bi.price_at_sale) * bi.quantity, 0);
                    return sub.toLocaleString('en-IN');
                  })()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Discount Given:</span>
                  <span>-₹{(() => {
                    const sub = (viewingReturnHistory.bill.bill_items || []).reduce((s, bi) => s + Number(bi.price_at_sale) * bi.quantity, 0);
                    const disc = Math.max(0, sub - Number(viewingReturnHistory.bill.total_amount || 0));
                    return disc.toLocaleString('en-IN');
                  })()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#000', marginTop: '4px' }}>
                  <span>Paid Total:</span>
                  <span>₹{Number(viewingReturnHistory.bill.total_amount).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            <div style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#666', marginBottom: '8px' }}>
              🔄 Return & Exchange Transaction History:
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {viewingReturnHistory.returns.map((ret, idx) => {
                const bItems = viewingReturnHistory.bill.bill_items || [];
                const matchItem = bItems.find(bi => bi.product_id === ret.returned_product_id || bi.products?.id === ret.returned_product_id);
                const prodInfo = matchItem?.products
                  ? `${matchItem.products.category} (${matchItem.products.size} ${matchItem.products.color})${matchItem.products.design_number ? ` | Design: #${matchItem.products.design_number}` : ''}`
                  : `ID #${(ret.returned_product_id || '').slice(0, 8)}`;

                return (
                  <div key={ret.id || idx} style={{ padding: '14px', background: '#faf8f5', border: '1px solid #ddd', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '8px', color: '#666', alignItems: 'center' }}>
                      <span>📅 {new Date(ret.created_at).toLocaleString('en-IN')}</span>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span className="badge badge-secondary">{ret.return_reason}</span>
                        <button
                          className="btn btn-secondary"
                          title="Delete Return Record"
                          style={{ padding: '2px 6px', fontSize: '12px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
                          onClick={() => setDeleteReturnItem(ret)}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#e74c3c' }}>
                      🔄 Returned: {prodInfo} (Qty: {ret.returned_qty})
                    </div>
                    {ret.exchanged_product_id && (
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#27ae60', marginTop: '4px' }}>
                        🎁 Replacement Issued: {ret.exchanged_product ? `${ret.exchanged_product.category} (${ret.exchanged_product.size} ${ret.exchanged_product.color})${ret.exchanged_product.design_number ? ` | Design: #${ret.exchanged_product.design_number}` : ''}` : `ID #${ret.exchanged_product_id.slice(0, 8)}`}
                      </div>
                    )}
                    {ret.discount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--success)', fontWeight: 600, marginTop: '4px' }}>
                        <span>Discount Given:</span>
                        <span>-₹{ret.discount}</span>
                      </div>
                    )}
                    <div style={{ borderTop: '1px dashed #ccc', marginTop: '10px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '13px' }}>
                      <span>Settlement:</span>
                      <span style={{ color: (ret.net_amount - (ret.discount || 0)) < 0 ? '#2980b9' : '#27ae60' }}>
                        {(ret.net_amount - (ret.discount || 0)) < 0 ? `Credit Voucher Issued ₹${Math.abs(ret.net_amount - (ret.discount || 0))}` : `Paid Extra ₹${ret.net_amount - (ret.discount || 0)}`}
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: '420px', maxWidth: '95%', margin: 0, padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            {viewingBillPreview.type === 'sale' ? (
              <div className="exchange-slip-preview" style={{ fontFamily: 'Montserrat, sans-serif', color: '#000' }}>
                <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '12px', marginBottom: '12px' }}>
                  <img src="/images/logo%20black.png" alt="Kiddorin Logo" style={{ maxWidth: '160px', maxHeight: '55px', objectFit: 'contain', display: 'block', margin: '0 auto 8px auto' }} />
                  <div style={{ fontSize: '10px', lineHeight: '1.4', marginBottom: '8px', color: '#444' }}>
                    {user?.branch?.address || 'G-69 , The Boulevard , Nr. Pratham Circle, Green City Road, Pal, Surat, Gujarat 395009'}
                  </div>
                  <div style={{ fontSize: '10px', fontWeight: '600', marginBottom: '8px' }}>
                    {user?.branch?.phone || '+91 94283 96273 | +91 94276 56615'}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', borderTop: '1px dashed #000', paddingTop: '8px' }}>Original Sale Bill</div>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>Bill No: {viewingBillPreview.id.slice(0, 8).toUpperCase()}</div>
                  <div style={{ fontSize: '10px', color: '#555' }}>Date: {viewingBillPreview.date}</div>
                </div>

                <div style={{ fontSize: '12px', marginBottom: '12px' }}>
                  <strong>Customer:</strong> {viewingBillPreview.customerName} {viewingBillPreview.customerPhone ? `(${viewingBillPreview.customerPhone})` : ''}<br />
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

                {viewingBillPreview.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingBottom: '4px', color: '#555' }}>
                    <span>Subtotal:</span>
                    <span>₹{viewingBillPreview.subtotal.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {viewingBillPreview.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingBottom: '4px', color: '#555' }}>
                    <span>Discount:</span>
                    <span>-₹{viewingBillPreview.discount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div style={{ borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '8px 0', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>
                  <span>Total Amount:</span>
                  <span>₹{viewingBillPreview.total.toLocaleString('en-IN')}</span>
                </div>

                <div style={{ textAlign: 'center', fontSize: '9px', color: '#666' }}>
                  Thank you for shopping with us!<br />No Return | No Exchange
                  <div style={{ marginTop: '4px', fontWeight: '600', color: '#000' }}>Follow us on Instagram @Kiddorin</div>
                </div>
              </div>
            ) : (
              <div className="exchange-slip-preview" style={{ fontFamily: 'Montserrat, sans-serif', color: '#000' }}>
                <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '12px', marginBottom: '12px' }}>
                  <img src="/images/logo%20black.png" alt="Kiddorin Logo" style={{ maxWidth: '160px', maxHeight: '55px', objectFit: 'contain', display: 'block', margin: '0 auto 8px auto' }} />
                  <div style={{ fontSize: '10px', lineHeight: '1.4', marginBottom: '8px', color: '#444' }}>
                    {user?.branch?.address || 'G-69 , The Boulevard , Nr. Pratham Circle, Green City Road, Pal, Surat, Gujarat 395009'}
                  </div>
                  <div style={{ fontSize: '10px', fontWeight: '600', marginBottom: '8px' }}>
                    {user?.branch?.phone || '+91 94283 96273 | +91 94276 56615'}
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
                    {(viewingBillPreview.returns || []).map((ret, rIdx) => (
                      <tr key={`ret-${rIdx}`}>
                        <td style={{ whiteSpace: 'normal', wordBreak: 'break-word', padding: '6px 0' }}>
                          <div style={{ fontWeight: 700, color: '#e74c3c' }}>RETURNED</div>
                          <div>{ret.products?.category} ({ret.products?.size} {ret.products?.color}) x {ret.qty}</div>
                          {ret.products?.design_number && (
                            <div style={{ fontSize: '9px', color: '#555', marginTop: '2px' }}>Design: #{ret.products.design_number}</div>
                          )}
                          <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>Reason: {ret.reason}</div>
                        </td>
                        <td style={{ textAlign: 'right', color: '#e74c3c' }}>-₹{ret.price * ret.qty}</td>
                      </tr>
                    ))}
                    {(viewingBillPreview.exchanges || []).map((ex, eIdx) => (
                      <tr key={`ex-${eIdx}`}>
                        <td style={{ whiteSpace: 'normal', wordBreak: 'break-word', padding: '6px 0' }}>
                          <div style={{ fontWeight: 700, color: '#27ae60' }}>ISSUED</div>
                          <div>{ex.product.category} ({ex.product.size} {ex.product.color}) x {ex.qty}</div>
                          {ex.product.design_number && (
                            <div style={{ fontSize: '9px', color: '#555', marginTop: '2px' }}>Design: #{ex.product.design_number}</div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', color: '#27ae60' }}>+₹{ex.product.selling_price * ex.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {viewingBillPreview.originalBill && (
                  <div className="no-print" style={{ background: '#fcfcfc', border: '1px solid #ddd', padding: '8px', borderRadius: '4px', marginBottom: '12px', fontSize: '10px' }}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#666', borderBottom: '1px solid #eee', paddingBottom: '4px', marginBottom: '6px' }}>
                      📄 Original Bill Details (Before Return)
                    </div>
                    <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px dashed #ccc', color: '#666' }}>
                          <th style={{ textAlign: 'left', padding: '2px 0' }}>Item</th>
                          <th style={{ textAlign: 'center', padding: '2px 0' }}>Qty</th>
                          <th style={{ textAlign: 'right', padding: '2px 0' }}>Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(viewingBillPreview.originalBill.bill_items || []).map((bi, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f9f9f9' }}>
                            <td style={{ padding: '3px 0' }}>
                              {bi.products?.category} ({bi.products?.size} {bi.products?.color})
                              {bi.products?.design_number && <div style={{ fontSize: '8px', color: '#777' }}>#{bi.products.design_number}</div>}
                            </td>
                            <td style={{ textAlign: 'center', padding: '3px 0' }}>{bi.quantity}</td>
                            <td style={{ textAlign: 'right', padding: '3px 0' }}>₹{bi.price_at_sale}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ borderTop: '1px dashed #ccc', marginTop: '6px', paddingTop: '6px', fontSize: '10px', color: '#555', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Subtotal:</span>
                        <span>₹{(() => {
                          const sub = (viewingBillPreview.originalBill.bill_items || []).reduce((s, bi) => s + Number(bi.price_at_sale) * bi.quantity, 0);
                          return sub.toLocaleString('en-IN');
                        })()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Discount Given:</span>
                        <span>-₹{(() => {
                          const sub = (viewingBillPreview.originalBill.bill_items || []).reduce((s, bi) => s + Number(bi.price_at_sale) * bi.quantity, 0);
                          const disc = Math.max(0, sub - Number(viewingBillPreview.originalBill.total_amount || 0));
                          return disc.toLocaleString('en-IN');
                        })()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#000', marginTop: '2px' }}>
                        <span>Paid Total:</span>
                        <span>₹{Number(viewingBillPreview.originalBill.total_amount).toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>
                )}

                {viewingBillPreview.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingBottom: '4px', color: '#666' }}>
                    <span>Subtotal:</span>
                    <span>₹{(viewingBillPreview.netAmount + viewingBillPreview.discount).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {viewingBillPreview.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingBottom: '4px', color: 'var(--success)', fontWeight: 600 }}>
                    <span>Discount:</span>
                    <span>-₹{viewingBillPreview.discount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div style={{ borderTop: '1px solid #000', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>
                  <span>Net Settled:</span>
                  <span>{viewingBillPreview.netAmount > 0 ? `Paid ₹${viewingBillPreview.netAmount} (${viewingBillPreview.paymentMethod})` : `Credit ₹${Math.abs(viewingBillPreview.netAmount)}`}</span>
                </div>

                <div style={{ textAlign: 'center', fontSize: '9px', color: '#666' }}>
                  Thank you for shopping with Kiddorin!<br />Exchanged goods are non-refundable.
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
                  {user?.branch?.address || 'G-69 , The Boulevard , Nr. Pratham Circle, Green City Road, Pal, Surat, Gujarat 395009'}
                </div>
                <div style={{ fontSize: '10px', fontWeight: '600' }}>
                  {user?.branch?.phone || '+91 94283 96273 | +91 94276 56615'}
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
                {printData.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingBottom: '4px', color: '#555' }}>
                    <span>Subtotal:</span>
                    <span>₹{printData.subtotal.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {printData.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingBottom: '4px', color: '#555' }}>
                    <span>Discount:</span>
                    <span>-₹{printData.discount.toLocaleString('en-IN')}</span>
                  </div>
                )}
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
                  {user?.branch?.address || 'G-69 , The Boulevard , Nr. Pratham Circle, Green City Road, Pal, Surat, Gujarat 395009'}
                </div>
                <div style={{ fontSize: '10px', fontWeight: '600', marginBottom: '8px' }}>
                  {user?.branch?.phone || '+91 94283 96273 | +91 94276 56615'}
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
                  {(printData.returns || []).map((ret, rIdx) => (
                    <tr key={`ret-${rIdx}`}>
                      <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                        <div style={{ fontWeight: 700 }}>RETURNED</div>
                        <div>{ret.products?.category} ({ret.products?.size} {ret.products?.color}) x {ret.qty}</div>
                        {ret.products?.design_number && (
                          <div style={{ fontSize: '9px', color: '#444', marginTop: '2px' }}>Design: #{ret.products.design_number}</div>
                        )}
                        <div style={{ fontSize: '9px', color: '#444', marginTop: '2px' }}>Reason: {ret.reason}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>-₹{ret.price * ret.qty}</td>
                    </tr>
                  ))}
                  {(printData.exchanges || []).map((ex, eIdx) => (
                    <tr key={`ex-${eIdx}`}>
                      <td style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                        <div style={{ fontWeight: 700 }}>ISSUED</div>
                        <div>{ex.product.category} ({ex.product.size} {ex.product.color}) x {ex.qty}</div>
                        {ex.product.design_number && (
                          <div style={{ fontSize: '9px', color: '#444', marginTop: '2px' }}>Design: #{ex.product.design_number}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>+₹{ex.product.selling_price * ex.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {printData.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', paddingBottom: '4px', borderBottom: '1px dashed #eee', marginBottom: '4px' }}>
                  <span>Discount:</span>
                  <span>-₹{printData.discount.toLocaleString('en-IN')}</span>
                </div>
              )}
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

      {/* Delete Bill Confirmation Modal */}
      {deleteBillItem && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="card" style={{ width: '420px', margin: 0, padding: '32px', textAlign: 'center', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <div className="section-title" style={{ color: 'var(--danger)', fontSize: '20px', borderBottom: 'none', paddingBottom: 0, marginBottom: '12px', display: 'block' }}>Confirm Bill Deletion</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
              Are you sure you want to permanently delete Bill #<strong style={{ color: 'var(--dark)' }}>{deleteBillItem.id.slice(0, 8).toUpperCase()}</strong> and all its associated items and returns?<br /><br />
              <strong style={{ color: '#DC2626', fontSize: '20px' }}>₹{Number(deleteBillItem.total_amount).toLocaleString('en-IN')}</strong><br />
              <span style={{ fontSize: '13px', color: '#6B7280', display: 'block', marginTop: '6px' }}>Customer: {deleteBillItem.customer_name || 'Walk-in'}</span>
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1, padding: '12px', fontSize: '13px', fontWeight: '600' }}
                onClick={() => setDeleteBillItem(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                style={{ flex: 1, padding: '12px', fontSize: '13px', fontWeight: '600', background: 'var(--danger)', color: 'var(--white)', border: 'none' }}
                onClick={async () => {
                  try {
                    await db.deleteBill(deleteBillItem.id);
                    toast.success('Bill deleted successfully');
                    setDeleteBillItem(null);
                    loadBills();
                  } catch (err) {
                    toast.error('Failed to delete bill: ' + err.message);
                  }
                }}
              >
                🗑️ Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Return Record Confirmation Modal */}
      {deleteReturnItem && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="card" style={{ width: '420px', margin: 0, padding: '32px', textAlign: 'center', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <div className="section-title" style={{ color: 'var(--danger)', fontSize: '20px', borderBottom: 'none', paddingBottom: 0, marginBottom: '12px', display: 'block' }}>Confirm Return Deletion</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
              Are you sure you want to permanently delete this return record?<br /><br />
              <strong style={{ color: 'var(--dark)', fontSize: '16px' }}>Reason: {deleteReturnItem.return_reason}</strong><br />
              <strong style={{ color: '#DC2626', fontSize: '18px' }}>Settlement: ₹{Math.abs(deleteReturnItem.net_amount || 0)}</strong>
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1, padding: '12px', fontSize: '13px', fontWeight: '600' }}
                onClick={() => setDeleteReturnItem(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                style={{ flex: 1, padding: '12px', fontSize: '13px', fontWeight: '600', background: 'var(--danger)', color: 'var(--white)', border: 'none' }}
                onClick={async () => {
                  try {
                    await db.deleteReturn(deleteReturnItem.id);
                    toast.success('Return record deleted');
                    const retId = deleteReturnItem.id;
                    setDeleteReturnItem(null);
                    if (viewingReturnHistory) {
                      const updatedRets = viewingReturnHistory.returns.filter(r => r.id !== retId);
                      if (updatedRets.length === 0) {
                        setViewingReturnHistory(null);
                      } else {
                        setViewingReturnHistory({ ...viewingReturnHistory, returns: updatedRets });
                      }
                    }
                    loadBills();
                  } catch (err) {
                    toast.error('Failed to delete return: ' + err.message);
                  }
                }}
              >
                🗑️ Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Exchanges;
