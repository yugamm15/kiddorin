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
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showFloatModal, setShowFloatModal] = useState(false);
  const [tableTab, setTableTab] = useState('all'); // 'all', 'expenses', 'float'
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

  const [floatForm, setFloatForm] = useState({
    branch_id: '',
    type: 'in', // 'in' (Add Cash from Home) or 'out' (Return Cash to Home)
    amount: '',
    date: new Date().toISOString().split('T')[0],
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
      
      if (branchesData && branchesData.length > 0) {
        if (!formData.branch_id) setFormData(prev => ({ ...prev, branch_id: branchesData[0].id }));
        if (!floatForm.branch_id) setFloatForm(prev => ({ ...prev, branch_id: branchesData[0].id }));
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

  const handleFloatChange = (e) => {
    const { name, value } = e.target;
    setFloatForm(prev => ({ ...prev, [name]: value }));
  };

  const handleExpenseSubmit = async (e) => {
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
      setShowExpenseModal(false);
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

  const handleFloatSubmit = async (e) => {
    e.preventDefault();
    if (!floatForm.branch_id || !floatForm.amount || isNaN(floatForm.amount) || Number(floatForm.amount) <= 0) {
      toast.error('Please select a branch and enter a valid amount.');
      return;
    }

    setSubmitting(true);
    const isIn = floatForm.type === 'in';
    const categoryName = isIn ? 'Cash In (Home Float)' : 'Cash Out (Return to Home)';
    const defaultDesc = isIn ? 'Added cash from home to drawer' : 'Returned cash float to home';

    const toastId = toast.loading(isIn ? 'Adding cash from home...' : 'Recording cash return to home...');
    try {
      await db.addExpense({
        branch_id: floatForm.branch_id,
        amount: parseFloat(floatForm.amount),
        category: categoryName,
        payment_method: 'Cash',
        expense_date: floatForm.date || new Date().toISOString().split('T')[0],
        description: floatForm.description.trim() || defaultDesc
      });
      toast.success(isIn ? '✔ Cash added from home to drawer successfully!' : '✔ Cash float returned to home recorded!', { id: toastId });
      setShowFloatModal(false);
      setFloatForm({
        branch_id: branches.length > 0 ? branches[0].id : '',
        type: 'in',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        description: ''
      });
      loadData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Error processing cash transfer.', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const openFloatModal = (type = 'in') => {
    setFloatForm(prev => ({
      ...prev,
      type,
      branch_id: prev.branch_id || (branches.length > 0 ? branches[0].id : ''),
      amount: '',
      description: ''
    }));
    setShowFloatModal(true);
  };

  const confirmDeleteExpense = async () => {
    if (!deleteExpenseItem) return;
    const toastId = toast.loading('Deleting record...');
    try {
      await db.deleteExpense(deleteExpenseItem.id);
      toast.success('Record deleted successfully.', { id: toastId });
      setDeleteExpenseItem(null);
      loadData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete record.', { id: toastId });
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
  const filteredRecords = expenses.filter(e => isDateInRange(e.expense_date));
  const filteredBills = bills.filter(b => isDateInRange(b.created_at));

  // Categorize records: Float vs Operational Expenses
  const isFloatIn = (e) => e.category === 'Cash In (Home Float)' || e.category === 'Cash In (From Home)';
  const isFloatOut = (e) => e.category === 'Cash Out (Return to Home)' || e.category === 'Cash Out (Home Return)';
  const isOperationalExpense = (e) => !isFloatIn(e) && !isFloatOut(e);

  const homeCashIn = filteredRecords.filter(isFloatIn).reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const homeCashOut = filteredRecords.filter(isFloatOut).reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const operationalExpenses = filteredRecords.filter(isOperationalExpense);
  const totalExpenseOutflow = operationalExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
  const cashExpenseOutflow = operationalExpenses.filter(e => e.payment_method === 'Cash').reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
  const upiExpenseOutflow = operationalExpenses.filter(e => e.payment_method === 'UPI').reduce((sum, exp) => sum + Number(exp.amount || 0), 0);

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

  // Accurate Net Drawer Cash Balance:
  // Net Drawer Cash = Sales Cash + Home Cash In - Home Cash Out - Cash Expenses Paid
  const netCashInDrawer = cashSales + homeCashIn - homeCashOut - cashExpenseOutflow;
  const netUpiInBank = upiSales - upiExpenseOutflow;
  const totalNetBalance = netCashInDrawer + netUpiInBank;

  // Display Table list according to active tab
  const displayedRows = filteredRecords.filter(r => {
    if (tableTab === 'expenses') return isOperationalExpense(r);
    if (tableTab === 'float') return isFloatIn(r) || isFloatOut(r);
    return true;
  });

  const exportExpensesCSV = () => {
    if (displayedRows.length === 0) {
      toast.error('No records available to export.');
      return;
    }

    const rows = [
      ["Date", "Branch Name", "Type / Category", "Description / Note", "Payment Mode", "Inflow (+)", "Outflow (-)"]
    ];

    displayedRows.forEach(exp => {
      const branchName = branches.find(b => b.id === exp.branch_id)?.name || exp.branches?.name || 'Unknown Store';
      const dateStr = exp.expense_date ? new Date(exp.expense_date).toLocaleDateString('en-IN') : '-';
      const isIn = isFloatIn(exp);
      const isOut = isFloatOut(exp);
      const inflow = isIn ? Number(exp.amount || 0) : '';
      const outflow = (isOut || isOperationalExpense(exp)) ? Number(exp.amount || 0) : '';

      rows.push([
        dateStr,
        branchName,
        exp.category || '',
        exp.description || '',
        exp.payment_method || 'Cash',
        inflow,
        outflow
      ]);
    });

    // Add empty row and summary rows at the bottom
    rows.push([]);
    rows.push(["Summary", "", "", "", "Home Cash In (+)", homeCashIn, ""]);
    rows.push(["", "", "", "", "Home Cash Returned (-)", "", homeCashOut]);
    rows.push(["", "", "", "", "Shop Cash Expenses (-)", "", cashExpenseOutflow]);
    rows.push(["", "", "", "", "Shop UPI Expenses (-)", "", upiExpenseOutflow]);
    rows.push(["", "", "", "", "Net Cash in Drawer", netCashInDrawer, ""]);

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    const dateLabel = (fromDate || toDate) ? `${fromDate || 'start'}_to_${toDate || 'end'}` : 'all_time';
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Shop_Expenses_Float_${dateLabel}.csv`);
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
          <div className="page-title" style={{ marginBottom: '4px' }}>💸 Shop Expenses & Petty Cash Float</div>
          <div className="page-sub" style={{ margin: 0 }}>Track worker payouts, refreshments, and Home Cash (Float In / Return to Home) across branches</div>
        </div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
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
            style={{ width: 'auto', minWidth: '170px', padding: '8px 12px', fontWeight: '500', marginBottom: 0 }}
            value={selectedBranchFilter}
            onChange={(e) => setSelectedBranchFilter(e.target.value)}
          >
            <option value="all">🌐 All Branches</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>🏪 {b.name}</option>
            ))}
          </select>

          {/* Action Buttons */}
          <button 
            className="btn btn-secondary" 
            onClick={() => openFloatModal('in')}
            style={{ backgroundColor: '#059669', color: '#FFFFFF', borderColor: '#059669', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}
            title="Add Cash from Home to Drawer Float"
          >
            + 🏠 Add Cash from Home
          </button>

          <button 
            className="btn btn-secondary" 
            onClick={() => openFloatModal('out')}
            style={{ backgroundColor: '#D97706', color: '#FFFFFF', borderColor: '#D97706', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}
            title="Return Cash Float to Home"
          >
            - 🏠 Return Cash to Home
          </button>

          <button className="btn btn-primary" onClick={() => setShowExpenseModal(true)} style={{ fontWeight: '600' }}>
            + 💸 Record Shop Expense
          </button>
        </div>
      </div>

      {/* NET FUNDS SUMMARY BANNER */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--dark)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          <span>📊 {dateRangeText} REAL-TIME CASH DRAWER & BANK RECONCILIATION</span>
        </div>
        <div className="branch-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          
          {/* Net Cash Card */}
          <div className="branch-card" style={{ padding: '20px', borderLeft: '4px solid #10B981', background: 'linear-gradient(to right, #F0FDF4, #FFFFFF)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px' }}>💵 Net Cash in Drawer</div>
                <div style={{ fontSize: '28px', fontWeight: '800', color: netCashInDrawer >= 0 ? '#15803D' : '#DC2626', marginTop: '6px' }}>
                  ₹{netCashInDrawer.toLocaleString('en-IN')}
                </div>
              </div>
              <span style={{ fontSize: '24px' }}>💵</span>
            </div>
            
            {/* Detailed 4-way Drawer Breakdown */}
            <div style={{ fontSize: '11px', color: '#374151', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #DCFCE7', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <div>Sales Cash: <strong style={{ color: '#15803D' }}>+₹{cashSales.toLocaleString('en-IN')}</strong></div>
              <div>Added from Home: <strong style={{ color: '#059669' }}>+₹{homeCashIn.toLocaleString('en-IN')}</strong></div>
              <div>Returned to Home: <strong style={{ color: '#D97706' }}>-₹{homeCashOut.toLocaleString('en-IN')}</strong></div>
              <div>Cash Expenses: <strong style={{ color: '#DC2626' }}>-₹{cashExpenseOutflow.toLocaleString('en-IN')}</strong></div>
            </div>
          </div>

          {/* Net UPI Card */}
          <div className="branch-card" style={{ padding: '20px', borderLeft: '4px solid #3B82F6', background: 'linear-gradient(to right, #EFF6FF, #FFFFFF)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📱 Net UPI in Bank</div>
                <div style={{ fontSize: '28px', fontWeight: '800', color: netUpiInBank >= 0 ? '#1D4ED8' : '#DC2626', marginTop: '6px' }}>
                  ₹{netUpiInBank.toLocaleString('en-IN')}
                </div>
              </div>
              <span style={{ fontSize: '24px' }}>📱</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#1E40AF', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #DBEAFE' }}>
              <span>Sales UPI: <strong>+₹{upiSales.toLocaleString('en-IN')}</strong></span>
              <span>UPI Expenses: <strong style={{ color: '#DC2626' }}>-₹{upiExpenseOutflow.toLocaleString('en-IN')}</strong></span>
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
              <span>Drawer Cash: <strong>₹{netCashInDrawer.toLocaleString('en-IN')}</strong></span>
              <span>Bank UPI: <strong>₹{netUpiInBank.toLocaleString('en-IN')}</strong></span>
            </div>
          </div>

        </div>
      </div>

      {/* Summary Stats Cards for Expenses & Float Outflow */}
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>💸 BREAKDOWN SUMMARY ({dateRangeText})</div>
      <div className="branch-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '24px', gap: '16px' }}>
        <div className="branch-card" style={{ padding: '16px', borderLeft: '4px solid var(--danger)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Shop Operational Expenses</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--danger)', marginTop: '4px' }}>₹{totalExpenseOutflow.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{operationalExpenses.length} regular expense(s)</div>
        </div>

        <div className="branch-card" style={{ padding: '16px', borderLeft: '4px solid #059669' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🏠 Cash Added from Home</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: '#059669', marginTop: '4px' }}>+₹{homeCashIn.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Float brought from home</div>
        </div>

        <div className="branch-card" style={{ padding: '16px', borderLeft: '4px solid #D97706' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🏠 Cash Returned to Home</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: '#D97706', marginTop: '4px' }}>-₹{homeCashOut.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Float withdrawn back home</div>
        </div>

        <div className="branch-card" style={{ padding: '16px', borderLeft: '4px solid #3B82F6' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Net Home Float in Drawer</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: (homeCashIn - homeCashOut) >= 0 ? '#1D4ED8' : '#DC2626', marginTop: '4px' }}>
            ₹{(homeCashIn - homeCashOut).toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Float In minus Float Out</div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', backgroundColor: '#FAFAFA', fontWeight: '600', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          
          {/* Filter Tabs */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--dark)' }}>📋 Logs:</span>
            <button
              onClick={() => setTableTab('all')}
              style={{
                background: tableTab === 'all' ? 'var(--dark)' : '#FFFFFF',
                color: tableTab === 'all' ? '#FFFFFF' : 'var(--dark)',
                border: '1px solid var(--border)',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              All Records ({filteredRecords.length})
            </button>
            <button
              onClick={() => setTableTab('expenses')}
              style={{
                background: tableTab === 'expenses' ? 'var(--danger)' : '#FFFFFF',
                color: tableTab === 'expenses' ? '#FFFFFF' : 'var(--dark)',
                border: '1px solid var(--border)',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              💸 Shop Expenses Only ({operationalExpenses.length})
            </button>
            <button
              onClick={() => setTableTab('float')}
              style={{
                background: tableTab === 'float' ? '#059669' : '#FFFFFF',
                color: tableTab === 'float' ? '#FFFFFF' : 'var(--dark)',
                border: '1px solid var(--border)',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              🏠 Home Float (In / Out) ({filteredRecords.filter(r => isFloatIn(r) || isFloatOut(r)).length})
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--text-muted)' }}>Showing {displayedRows.length} record(s)</span>
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
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading expenses and float logs...</div>
        ) : displayedRows.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🧾</div>
            <div>No records found for this view.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: '#F3F4F6', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px' }}>Date</th>
                  <th style={{ padding: '12px 16px' }}>Branch</th>
                  <th style={{ padding: '12px 16px' }}>Category / Type</th>
                  <th style={{ padding: '12px 16px' }}>Description / Note</th>
                  <th style={{ padding: '12px 16px' }}>Payment Mode</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', width: '80px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((exp) => {
                  const isIn = isFloatIn(exp);
                  const isOut = isFloatOut(exp);
                  return (
                    <tr 
                      key={exp.id} 
                      style={{ 
                        borderBottom: '1px solid var(--border)', 
                        fontSize: '13px', 
                        transition: 'background 0.2s',
                        backgroundColor: isIn ? 'rgba(5, 150, 105, 0.03)' : (isOut ? 'rgba(217, 119, 6, 0.03)' : 'transparent')
                      }}
                    >
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        {exp.expense_date ? new Date(exp.expense_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: '600', color: 'var(--primary)' }}>
                        🏪 {branches.find(b => b.id === exp.branch_id)?.name || exp.branches?.name || 'Unknown Store'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {isIn ? (
                          <span style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', backgroundColor: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0' }}>
                            🏠 Cash In (From Home)
                          </span>
                        ) : isOut ? (
                          <span style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', backgroundColor: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A' }}>
                            🏠 Cash Out (Return to Home)
                          </span>
                        ) : (
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
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', color: 'var(--dark)', maxWidth: '300px' }}>
                        {exp.description}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {isIn ? (
                          <span style={{ fontWeight: '600', color: '#059669' }}>💵 Drawer Cash Inflow</span>
                        ) : isOut ? (
                          <span style={{ fontWeight: '600', color: '#D97706' }}>💵 Drawer Cash Outflow</span>
                        ) : (
                          <span style={{
                            fontWeight: '600',
                            color: exp.payment_method === 'Cash' ? '#10B981' : '#3B82F6'
                          }}>
                            {exp.payment_method === 'Cash' ? '💵 Cash' : '📱 UPI'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '700', fontSize: '14px' }}>
                        {isIn ? (
                          <span style={{ color: '#059669' }}>+ ₹{Number(exp.amount).toLocaleString('en-IN')}</span>
                        ) : isOut ? (
                          <span style={{ color: '#D97706' }}>- ₹{Number(exp.amount).toLocaleString('en-IN')}</span>
                        ) : (
                          <span style={{ color: '#DC2626' }}>- ₹{Number(exp.amount).toLocaleString('en-IN')}</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <button
                          onClick={() => setDeleteExpenseItem(exp)}
                          style={{
                            background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: '16px'
                          }}
                          title="Delete record"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Shop Expense Modal */}
      {showExpenseModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="card" style={{ width: '450px', margin: '20px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="section-title" style={{ marginBottom: '6px' }}>💸 Record Shop Operational Expense</div>
            <p style={{ marginBottom: '20px', fontSize: '13px', color: 'var(--text-muted)' }}>
              Enter cash or UPI payouts given for worker wages, tea/refreshments, courier, or shop maintenance.
            </p>

            <form onSubmit={handleExpenseSubmit}>
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
                    <option value="Cash">💵 Cash (From Drawer)</option>
                    <option value="UPI">📱 UPI / Online</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label>Description / Note *</label>
                <input type="text" name="description" required placeholder="e.g. Given 100rs to worker for tea" value={formData.description} onChange={handleInputChange} />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Saving...' : '✔ Save Expense'}
                </button>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowExpenseModal(false)} disabled={submitting}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cash In / Return Cash Float Modal */}
      {showFloatModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="card" style={{ width: '450px', margin: '20px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="section-title" style={{ marginBottom: '6px', color: floatForm.type === 'in' ? '#059669' : '#D97706' }}>
              {floatForm.type === 'in' ? '🏠 Add Cash from Home (Drawer Float In)' : '🏠 Return Cash Float to Home (Drawer Float Out)'}
            </div>
            <p style={{ marginBottom: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>
              {floatForm.type === 'in'
                ? 'Bring personal money from home into the cash drawer. This increases your drawer cash balance without affecting business sales revenue.'
                : 'Take back float cash from the shop drawer to home. This decreases drawer cash without being recorded as a shop business expense.'}
            </p>

            {/* Type Toggle Tabs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px', background: '#F3F4F6', padding: '4px', borderRadius: '8px' }}>
              <button
                type="button"
                onClick={() => setFloatForm(prev => ({ ...prev, type: 'in' }))}
                style={{
                  padding: '8px',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: '700',
                  fontSize: '12px',
                  cursor: 'pointer',
                  backgroundColor: floatForm.type === 'in' ? '#059669' : 'transparent',
                  color: floatForm.type === 'in' ? '#FFFFFF' : '#4B5563'
                }}
              >
                + Add from Home
              </button>
              <button
                type="button"
                onClick={() => setFloatForm(prev => ({ ...prev, type: 'out' }))}
                style={{
                  padding: '8px',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: '700',
                  fontSize: '12px',
                  cursor: 'pointer',
                  backgroundColor: floatForm.type === 'out' ? '#D97706' : 'transparent',
                  color: floatForm.type === 'out' ? '#FFFFFF' : '#4B5563'
                }}
              >
                - Return to Home
              </button>
            </div>

            <form onSubmit={handleFloatSubmit}>
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label>Select Branch Shop *</label>
                <select name="branch_id" required value={floatForm.branch_id} onChange={handleFloatChange} className="form-control">
                  <option value="">-- Choose Branch --</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Amount (₹) *</label>
                  <input 
                    type="number" 
                    name="amount" 
                    required 
                    min="1" 
                    step="any" 
                    placeholder="e.g. 500" 
                    value={floatForm.amount} 
                    onChange={handleFloatChange} 
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Date</label>
                  <input 
                    type="date" 
                    name="date" 
                    required 
                    value={floatForm.date} 
                    onChange={handleFloatChange} 
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label>Note / Reason (Optional)</label>
                <input 
                  type="text" 
                  name="description" 
                  placeholder={floatForm.type === 'in' ? 'e.g. Morning cash float brought from home' : 'e.g. Returned home float money'} 
                  value={floatForm.description} 
                  onChange={handleFloatChange} 
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ flex: 1, backgroundColor: floatForm.type === 'in' ? '#059669' : '#D97706', borderColor: floatForm.type === 'in' ? '#059669' : '#D97706' }} 
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : (floatForm.type === 'in' ? '✔ Add Cash to Drawer' : '✔ Return Cash to Home')}
                </button>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowFloatModal(false)} disabled={submitting}>
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
            <div className="section-title" style={{ color: 'var(--danger)', fontSize: '20px', borderBottom: 'none', paddingBottom: 0, marginBottom: '12px', display: 'block' }}>Confirm Record Deletion</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
              Are you sure you want to permanently delete this record?<br/><br/>
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

