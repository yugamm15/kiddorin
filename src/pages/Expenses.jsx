import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import toast from 'react-hot-toast';

const Expenses = () => {
  const [expenses, setExpenses] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
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
      const [branchesData, expensesData] = await Promise.all([
        db.getBranchesWithStats(),
        db.getExpenses(selectedBranchFilter)
      ]);
      setBranches(branchesData || []);
      setExpenses(expensesData || []);
      
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

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this expense record?')) return;
    const toastId = toast.loading('Deleting expense...');
    try {
      await db.deleteExpense(id);
      toast.success('Expense deleted successfully.', { id: toastId });
      loadData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete expense.', { id: toastId });
    }
  };

  // Calculate summary statistics
  const totalAmount = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const cashAmount = expenses.filter(e => e.payment_method === 'Cash').reduce((sum, exp) => sum + Number(exp.amount), 0);
  const upiAmount = expenses.filter(e => e.payment_method === 'UPI').reduce((sum, exp) => sum + Number(exp.amount), 0);

  return (
    <div className="page active" id="expenses-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div className="page-title" style={{ marginBottom: '4px' }}>💸 Shop Expenses & Petty Cash</div>
          <div className="page-sub" style={{ margin: 0 }}>Track worker payouts, refreshments, and daily store operational costs across branches</div>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select
            className="form-control"
            style={{ width: 'auto', minWidth: '180px', padding: '8px 12px', fontWeight: '500' }}
            value={selectedBranchFilter}
            onChange={(e) => setSelectedBranchFilter(e.target.value)}
          >
            <option value="all">🌐 All Branches</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>🏪 {b.name}</option>
            ))}
          </select>

          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Record New Expense
          </button>
        </div>
      </div>

      {/* Summary Stats Cards */}
      <div className="branch-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '24px' }}>
        <div className="branch-card" style={{ padding: '16px', borderLeft: '4px solid var(--primary)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Expenses Outflow</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--dark)', marginTop: '4px' }}>₹{totalAmount.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{expenses.length} total transaction(s)</div>
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
          <span style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--text-muted)' }}>Showing {expenses.length} record(s)</span>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading shop expenses...</div>
        ) : expenses.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🧾</div>
            <div>No shop expenses recorded yet for this view.</div>
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
                {expenses.map((exp) => (
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
                        onClick={() => handleDelete(exp.id)}
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
    </div>
  );
};

export default Expenses;
