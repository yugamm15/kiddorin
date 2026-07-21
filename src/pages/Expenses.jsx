import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { supabase } from '../services/supabaseClient';
import toast from 'react-hot-toast';

const Expenses = () => {
  const [expenses, setExpenses] = useState([]);
  const [bills, setBills] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('all');
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]); // Default today
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]); // Default today
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleteExpenseItem, setDeleteExpenseItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    branch_id: '',
    amount: '',
    category: 'Worker Payment',
    payment_method: 'Cash',
    expense_date: new Date().toISOString().split('T')[0],
    description: ''
  });

  const categories = [
    'Worker Payment',
    'Tea & Refreshments',
    'Shop Maintenance',
    'Stationary & Supplies',
    'Packaging Material',
    'Shipping / Courier',
    'Miscellaneous'
  ];

  const loadData = async () => {
    setLoading(true);
    try {
      let billsQuery = supabase.from('bills').select('total_amount, payment_method, split_cash, split_upi, created_at, branch_id');
      if (selectedBranchFilter !== 'all') {
        billsQuery = billsQuery.eq('branch_id', selectedBranchFilter);
      }
      const [branchesData, expensesData, billsRes] = await Promise.all([
        db.getBranchesWithStats(),
        db.getExpenses(selectedBranchFilter),
        billsQuery
      ]);
      setBranches(branchesData || []);
      setExpenses(expensesData || []);
      setBills(billsRes?.data || []);
      
      if (!formData.branch_id && branchesData && branchesData.length > 0) {
        setFormData(prev => ({ ...prev, branch_id: branchesData[0].id }));
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load expenses data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedBranchFilter]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.branch_id || !formData.amount || !formData.description.trim()) {
      toast.error('Please select a branch, enter an amount, and add a description.');
      return;
    }
    if (isNaN(formData.amount) || Number(formData.amount) <= 0) {
      toast.error('Please enter a valid expense amount.');
      return;
    }

    setSubmitting(true);
    const toastId = toast.loading('Recording shop expense...');
    try {
      await db.addExpense(formData);
      toast.success('Expense recorded successfully!', { id: toastId });
      setShowModal(false);
      setFormData({
        branch_id: branches.length > 0 ? branches[0].id : '',
        amount: '',
        category: 'Worker Payment',
        payment_method: 'Cash',
        expense_date: new Date().toISOString().split('T')[0],
        description: ''
      });
      loadData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Error recording expense.', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeleteExpense = async () => {
    if (!deleteExpenseItem) return;
    const toastId = toast.loading('Deleting expense...');
    try {
      await db.deleteExpense(deleteExpenseItem.id);
      toast.success('Expense deleted successfully.', { id: toastId });
      setDeleteExpenseItem(null);
      loadData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete expense.', { id: toastId });
    }
  };

  // Helper to check if date falls in range
  const isDateInRange = (dateStr) => {
    if (!dateStr) return false;
    const d = dateStr.split('T')[0];
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  };

  // Filter by selected date range
  const filteredExpenses = expenses.filter(e => isDateInRange(e.expense_date));
  const filteredBills = bills.filter(b => isDateInRange(b.created_at));

  // Calculate summary statistics
  const totalAmount = filteredExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
  const cashAmount = filteredExpenses.filter(e => e.payment_method === 'Cash').reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
  const upiAmount = filteredExpenses.filter(e => e.payment_method === 'UPI').reduce((sum, exp) => sum + Number(exp.amount || 0), 0);

  // Calculate Sales Inflow
  let cashSales = 0;
  let upiSales = 0;
  filteredBills.forEach(b => {
    const pm = (b.payment_method || '').toLowerCase();
    if (pm === 'cash') {
      cashSales += Number(b.total_amount || 0);
    } else if (pm === 'upi') {
      upiSales += Number(b.total_amount || 0);
    } else if (pm.includes('split') || Number(b.split_cash || 0) > 0 || Number(b.split_upi || 0) > 0) {
      let sc = Number(b.split_cash || 0);
      let su = Number(b.split_upi || 0);
      if (sc === 0 && su === 0 && pm.includes('split')) {
        const match = pm.match(/Cash:\s*₹?([\d.]+).*?(?:GPay|UPI):\s*₹?([\d.]+)/i) || (b.payment_method || '').match(/₹?([\d.]+).*?₹?([\d.]+)/);
        if (match) {
          sc = parseFloat(match[1]) || 0;
          su = parseFloat(match[2]) || 0;
        } else {
          const tot = Number(b.total_amount || 0);
          sc = tot / 2;
          su = tot / 2;
        }
      }
      cashSales += sc;
      upiSales += su;
    } else {
      cashSales += Number(b.total_amount || 0);
    }
  });
  const totalSales = cashSales + upiSales;

  // Net Balances
  const netCash = cashSales - cashAmount;
  const netUpi = upiSales - upiAmount;
  const totalNetBalance = totalSales - totalAmount;

  const exportExpensesCSV = () => {
    if (filteredExpenses.length === 0) {
      toast.error('No expense records available to export.');
      return;
    }

    const rows = [
      ["Date", "Branch Name", "Category", "Description / Note", "Payment Mode", "Amount (INR)"]
    ];

    filteredExpenses.forEach(exp => {
      const branchName = branches.find(b => b.id === exp.branch_id)?.name || exp.branches?.name || 'Unknown Store';
      const dateStr = exp.expense_date ? new Date(exp.expense_date).toLocaleDateString('en-IN') : '-';
      rows.push([
        dateStr,
        branchName,
        exp.category || '',
        exp.description || '',
        exp.payment_method || 'Cash',
        exp.amount || 0
      ]);
    });

    // Add empty row and summary rows at the bottom
    rows.push([]);
    rows.push(["Summary Statistics", "", "", "", "Cash Payouts", cashAmount]);
    rows.push(["", "", "", "", "UPI Payouts", upiAmount]);
    rows.push(["", "", "", "", "Total Outflow", totalAmount]);

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    const dateLabel = (fromDate || toDate) ? `${fromDate || 'start'}_to_${toDate || 'end'}` : 'all_time';
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Shop_Expenses_${dateLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Excel / CSV file exported successfully!");
  };

  const dateRangeText = (fromDate && toDate && fromDate === toDate && fromDate === new Date().toISOString().split('T')[0])
    ? "TODAY'S"
    : (fromDate || toDate)
      ? `${fromDate || 'Start'} to ${toDate || 'Present'}`
      : "ALL TIME";

  return (
    <div className="page active" id="expenses-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div className="page-title" style={{ marginBottom: '4px' }}>💸 Shop Expenses & Petty Cash</div>
          <div className="page-sub" style={{ margin: 0 }}>Track worker payouts, refreshments, and daily store operational costs across branches</div>
        </div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--white)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--dark)' }}>📅 From:</span>
            <input 
              type="date" 
              className="form-control" 
              style={{ width: 'auto', marginBottom: 0, padding: '4px 8px', fontSize: '13px', border: 'none', background: 'transparent' }} 
              value={fromDate} 
              onChange={e => setFromDate(e.target.value)} 
            />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--dark)' }}>To:</span>
            <input 
              type="date" 
              className="form-control" 
              style={{ width: 'auto', marginBottom: 0, padding: '4px 8px', fontSize: '13px', border: 'none', background: 'transparent' }} 
              value={toDate} 
              onChange={e => setToDate(e.target.value)} 
            />
            {(fromDate || toDate) ? (
              <button 
                onClick={() => { setFromDate(''); setToDate(''); }} 
                style={{ background: '#F3F4F6', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: '#4B5563' }}
                title="Show All Time Records"
              >
                Show All
              </button>
            ) : null}
            <button 
              onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                setFromDate(today);
                setToDate(today);
              }} 
              style={{ background: 'var(--primary)', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: 'var(--white)' }}
              title="Show Today's Records"
            >
              Today
            </button>
          </div>

          <select
            className="form-control"
            style={{ width: 'auto', minWidth: '180px', padding: '8px 12px', fontWeight: '500', marginBottom: 0 }}
            value={selectedBranchFilter}
            onChange={(e) => setSelectedBranchFilter(e.target.value)}
          >
            <option value="all">🌐 All Branches</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>🏪 {b.name}</option>
            ))}
          </select>

          <button className="btn btn-secondary" onClick={exportExpensesCSV} style={{ backgroundColor: '#10B981', color: 'var(--white)', borderColor: '#10B981', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}>
            ⬇️ Export Excel
          </button>

          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Record New Expense
          </button>
        </div>
      </div>

      {/* NET FUNDS SUMMARY BANNER */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--dark)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          <span>📊 {dateRangeText} NET CASH & UPI BALANCE (Sales Inflow minus Shop Expenses)</span>
        </div>
        <div className="branch-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          
          {/* Net Cash Card */}
          <div className="branch-card" style={{ padding: '20px', borderLeft: '4px solid #10B981', background: 'linear-gradient(to right, #F0FDF4, #FFFFFF)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px' }}>💵 Net Cash in Drawer</div>
                <div style={{ fontSize: '28px', fontWeight: '800', color: netCash >= 0 ? '#15803D' : '#DC2626', marginTop: '6px' }}>
                  ₹{netCash.toLocaleString('en-IN')}
                </div>
              </div>
              <span style={{ fontSize: '24px' }}>💵</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#166534', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #DCFCE7' }}>
              <span>Sales Cash: <strong>+₹{cashSales.toLocaleString('en-IN')}</strong></span>
              <span>Expenses Paid: <strong style={{ color: '#DC2626' }}>-₹{cashAmount.toLocaleString('en-IN')}</strong></span>
            </div>
          </div>

          {/* Net UPI Card */}
          <div className="branch-card" style={{ padding: '20px', borderLeft: '4px solid #3B82F6', background: 'linear-gradient(to right, #EFF6FF, #FFFFFF)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📱 Net UPI in Bank</div>
                <div style={{ fontSize: '28px', fontWeight: '800', color: netUpi >= 0 ? '#1D4ED8' : '#DC2626', marginTop: '6px' }}>
                  ₹{netUpi.toLocaleString('en-IN')}
                </div>
              </div>
              <span style={{ fontSize: '24px' }}>📱</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#1E40AF', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #DBEAFE' }}>
              <span>Sales UPI: <strong>+₹{upiSales.toLocaleString('en-IN')}</strong></span>
              <span>Expenses Paid: <strong style={{ color: '#DC2626' }}>-₹{upiAmount.toLocaleString('en-IN')}</strong></span>
            </div>
          </div>

          {/* Total Net Balance Card */}
          <div className="branch-card" style={{ padding: '20px', borderLeft: '4px solid var(--gold)', background: 'linear-gradient(to right, #FDFBF7, #FFFFFF)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gold-dark)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>💰 Total Net Available Funds</div>
                <div style={{ fontSize: '28px', fontWeight: '800', color: totalNetBalance >= 0 ? 'var(--dark)' : '#DC2626', marginTop: '6px' }}>
                  ₹{totalNetBalance.toLocaleString('en-IN')}
                </div>
              </div>
              <span style={{ fontSize: '24px' }}>💰</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #EBE0D0' }}>
              <span>Total Revenue: <strong>+₹{totalSales.toLocaleString('en-IN')}</strong></span>
              <span>Total Outflow: <strong style={{ color: '#DC2626' }}>-₹{totalAmount.toLocaleString('en-IN')}</strong></span>
            </div>
          </div>

        </div>
      </div>

      {/* Summary Stats Cards for Expenses Outflow */}
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>💸 EXPENSES OUTFLOW BREAKDOWN ({dateRangeText})</div>
      <div className="branch-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '24px' }}>
        <div className="branch-card" style={{ padding: '16px', borderLeft: '4px solid var(--primary)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Expenses Outflow</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--dark)', marginTop: '4px' }}>₹{totalAmount.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{filteredExpenses.length} total transaction(s)</div>
        </div>

        <div className="branch-card" style={{ padding: '16px', borderLeft: '4px solid #10B981' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cash Payouts</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#10B981', marginTop: '4px' }}>₹{cashAmount.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Paid directly from cash counter</div>
        </div>

        <div className="branch-card" style={{ padding: '16px', borderLeft: '4px solid #3B82F6' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>UPI / Online Payments</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#3B82F6', marginTop: '4px' }}>₹{upiAmount.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Digital shop transactions</div>
        </div>
      </div>

      {/* Expenses List Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', backgroundColor: '#FAFAFA', fontWeight: '600', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📋 Expense Transactions Log</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--text-muted)' }}>Showing {filteredExpenses.length} record(s)</span>
            <button 
              onClick={exportExpensesCSV} 
              style={{ background: '#E0F2FE', color: '#0369A1', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="Download Excel / CSV"
            >
              ⬇️ Export Excel
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading shop expenses...</div>
        ) : filteredExpenses.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🧾</div>
            <div>No shop expenses recorded for this date view.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: '#F3F4F6', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px' }}>Date</th>
                  <th style={{ padding: '12px 16px' }}>Branch</th>
                  <th style={{ padding: '12px 16px' }}>Category</th>
                  <th style={{ padding: '12px 16px' }}>Description / Note</th>
                  <th style={{ padding: '12px 16px' }}>Payment Mode</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', width: '80px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} style={{ borderBottom: '1px solid var(--border)', fontSize: '13px', transition: 'background 0.2s' }}>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      {exp.expense_date ? new Date(exp.expense_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: '600', color: 'var(--primary)' }}>
                      🏪 {branches.find(b => b.id === exp.branch_id)?.name || exp.branches?.name || 'Unknown Store'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        backgroundColor: exp.category === 'Worker Payment' ? '#FEF3C7' : '#E0F2FE',
                        color: exp.category === 'Worker Payment' ? '#D97706' : '#0369A1'
                      }}>
                        {exp.category}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--dark)', maxWidth: '300px' }}>
                      {exp.description}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        fontWeight: '600',
                        color: exp.payment_method === 'Cash' ? '#10B981' : '#3B82F6'
                      }}>
                        {exp.payment_method === 'Cash' ? '💵 Cash' : '📱 UPI'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '700', fontSize: '14px', color: '#DC2626' }}>
                      - ₹{Number(exp.amount).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <button
                        onClick={() => setDeleteExpenseItem(exp)}
                        style={{
                          background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: '16px'
                        }}
                        title="Delete expense"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Expense Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="card" style={{ width: '450px', margin: '20px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="section-title" style={{ marginBottom: '6px' }}>💸 Record Shop Expense</div>
            <p style={{ marginBottom: '20px', fontSize: '13px', color: 'var(--text-muted)' }}>
              Enter cash payouts given to workers, shop refreshments, or daily maintenance bills.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label>Select Branch Shop *</label>
                <select name="branch_id" required value={formData.branch_id} onChange={handleInputChange} className="form-control">
                  <option value="">-- Choose Branch --</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Amount (₹) *</label>
                  <input type="number" name="amount" required min="1" step="any" placeholder="e.g. 100" value={formData.amount} onChange={handleInputChange} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Date</label>
                  <input type="date" name="expense_date" required value={formData.expense_date} onChange={handleInputChange} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Expense Category *</label>
                  <select name="category" value={formData.category} onChange={handleInputChange} className="form-control">
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Payment Method *</label>
                  <select name="payment_method" value={formData.payment_method} onChange={handleInputChange} className="form-control">
                    <option value="Cash">💵 Cash</option>
                    <option value="UPI">📱 UPI</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label>Description / Note *</label>
                <input type="text" name="description" required placeholder="e.g. Given 100rs to worker Ramesh for tea/work" value={formData.description} onChange={handleInputChange} />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Saving...' : '✔ Save Expense'}
                </button>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)} disabled={submitting}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteExpenseItem && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="card" style={{ width: '420px', margin: 0, padding: '32px', textAlign: 'center', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <div className="section-title" style={{ color: 'var(--danger)', fontSize: '20px', borderBottom: 'none', paddingBottom: 0, marginBottom: '12px', display: 'block' }}>Confirm Expense Deletion</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
              Are you sure you want to permanently delete this expense record?<br/><br/>
              <strong style={{ color: 'var(--dark)', fontSize: '16px' }}>{deleteExpenseItem.category}</strong><br/>
              <strong style={{ color: '#DC2626', fontSize: '20px' }}>₹{Number(deleteExpenseItem.amount).toLocaleString('en-IN')}</strong><br/>
              {deleteExpenseItem.description && <span style={{ fontSize: '13px', color: '#6B7280', display: 'block', marginTop: '6px' }}>"{deleteExpenseItem.description}"</span>}
            </p>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button 
                className="btn btn-secondary" 
                style={{ flex: 1, padding: '12px', fontSize: '13px', fontWeight: '600' }} 
                onClick={() => setDeleteExpenseItem(null)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-danger" 
                style={{ flex: 1, padding: '12px', fontSize: '13px', fontWeight: '600', background: 'var(--danger)', color: 'var(--white)', border: 'none' }} 
                onClick={confirmDeleteExpense}
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

export default Expenses;
