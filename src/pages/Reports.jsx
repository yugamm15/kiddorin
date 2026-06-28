import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import { db } from '../services/db';
import toast from 'react-hot-toast';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';

const COLORS = ['#C5A059', '#1E4620', '#003366', '#8B0000', '#CC5500', '#666666', '#00C49F', '#FFBB28', '#FF8042'];

const Reports = () => {
  const { user } = useAuth();
  const [currentReport, setCurrentReport] = useState('stock');
  
  // Data States
  const [bills, setBills] = useState([]);
  const [products, setProducts] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [branches, setBranches] = useState([]);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const titles = {
    stock: '📦 Stock Report',
    sales: '📈 Sale Report',
    payment: '💳 Payment Report',
    branch: '🏪 Branch-wise Report',
    purchase: '🛒 Purchase Report',
    profit: '💰 Profit & Loss Report',
    product: '👕 Product-wise Report',
    transactions: '🧾 All Transactions Report'
  };

  const reportsList = [
    { key: 'stock', icon: '📦', title: 'Stock Report', desc: 'Inventory & pricing' },
    { key: 'sales', icon: '📈', title: 'Sale Report', desc: 'Customer margins & sales' },
    { key: 'payment', icon: '💳', title: 'Payment Report', desc: 'Cash vs UPI breakdown' },
    { key: 'branch', icon: '🏪', title: 'Branch-wise Report', desc: 'Store sales comparison' },
    { key: 'purchase', icon: '🛒', title: 'Purchase Report', desc: 'Supplier stock inflows' },
    { key: 'profit', icon: '💰', title: 'Profit & Loss Report', desc: 'True net earnings' },
    { key: 'product', icon: '👕', title: 'Product-wise Report', desc: 'Category movement' },
    { key: 'transactions', icon: '🧾', title: 'All Transactions', desc: 'Inflows & outflows' }
  ];

  const loadAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch bills with items
      let billsQuery = supabase.from('bills').select('*, bill_items(*, products(*)), branches(name)').order('created_at', { ascending: false });
      let productsQuery = supabase.from('products').select('*, branches(name)').order('created_at', { ascending: false });
      
      if (user.role !== 'superadmin') {
        billsQuery = billsQuery.eq('branch_id', user.branch_id);
        productsQuery = productsQuery.eq('branch_id', user.branch_id);
      }

      const [bRes, pRes, dRes, purRes, expRes, brRes] = await Promise.all([
        billsQuery,
        productsQuery,
        supabase.from('dealers').select('*'),
        supabase.from('purchases').select('*').order('date', { ascending: false }),
        db.getExpenses('all'),
        supabase.from('branches').select('*')
      ]);

      setBills(bRes.data || []);
      setProducts(pRes.data || []);
      setDealers(dRes.data || []);
      setPurchases(purRes.data || []);
      setExpenses(expRes || []);
      setBranches(brRes.data || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load report data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [user]);

  // Lookup Maps
  const dealerMap = {};
  dealers.forEach(d => dealerMap[d.id] = d.name);

  const purchaseMap = {};
  purchases.forEach(p => {
    if (!purchaseMap[p.product_id]) purchaseMap[p.product_id] = p;
  });

  // Filter Helper
  const filterByBranchAndDate = (itemDateStr, branchId) => {
    if (selectedBranch !== 'all' && branchId !== selectedBranch) return false;
    if (!itemDateStr) return true;
    const dateOnly = new Date(itemDateStr).toISOString().split('T')[0];
    if (fromDate && dateOnly < fromDate) return false;
    if (toDate && dateOnly > toDate) return false;
    return true;
  };

  const matchSearch = (textArray) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return textArray.some(t => t && String(t).toLowerCase().includes(q));
  };

  // CSV Export Logic
  const exportCSV = () => {
    let rows = [];
    const filename = `${currentReport}_report_${new Date().toISOString().split('T')[0]}.csv`;

    if (currentReport === 'stock') {
      rows.push(["Date", "Supplier Name", "Design Number", "Color", "Category", "Cost Price", "Selling Price", "Quantity"]);
      getFilteredStock().forEach(p => {
        rows.push([
          p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN') : '-',
          dealerMap[p.dealer_id] || 'Direct / Unknown',
          p.design_number, p.color, p.category, p.purchase_price, p.selling_price, p.quantity
        ]);
      });
    } else if (currentReport === 'sales') {
      rows.push(["Date of Buy", "Date of Sale", "Supplier Name", "Customer Name", "Contact", "Cost Price", "Sale Price", "Profit", "Payment Mode"]);
      getFilteredSalesItems().forEach(item => {
        rows.push([
          item.buyDate, item.saleDate, item.supplier, item.customer, item.contact, item.cost, item.salePrice, item.profit, item.paymentMethod
        ]);
      });
    } else if (currentReport === 'payment') {
      rows.push(["Payment Mode", "Total Bills", "Total Revenue"]);
      getFilteredPaymentStats().forEach(s => rows.push([s.mode, s.count, s.revenue]));
    } else if (currentReport === 'branch') {
      rows.push(["Branch Name", "Total Revenue", "Total Bills", "Stock Items"]);
      getFilteredBranchStats().forEach(b => rows.push([b.name, b.revenue, b.billsCount, b.stockItems]));
    } else if (currentReport === 'purchase') {
      rows.push(["Purchase Date", "Supplier Name", "Design Number", "Category", "Quantity Bought", "Purchase Price", "Total Cost"]);
      getFilteredPurchases().forEach(p => rows.push([p.dateStr, p.supplier, p.design, p.category, p.qty, p.price, p.total]));
    } else if (currentReport === 'profit') {
      rows.push(["Date", "Sales Revenue", "Cost of Goods", "Shop Expenses", "Net Profit/Loss"]);
      getFilteredProfitLoss().forEach(pl => rows.push([pl.date, pl.revenue, pl.cogs, pl.expenses, pl.net]));
    } else if (currentReport === 'product') {
      rows.push(["Category", "Units Sold", "Revenue Generated", "Current Stock Left"]);
      getFilteredProductStats().forEach(ps => rows.push([ps.category, ps.sold, ps.revenue, ps.stock]));
    } else if (currentReport === 'transactions') {
      rows.push(["Date", "Type", "Reference ID", "Party / Description", "Payment Mode", "Amount"]);
      getFilteredTransactions().forEach(t => rows.push([t.dateStr, t.type, t.ref, t.party, t.mode, t.amount]));
    }

    if (rows.length === 0) {
      toast.error("No data available to export.");
      return;
    }

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV file downloaded successfully!");
  };

  // --- REPORT DATA GENERATION ---

  // 1. Stock Report
  const getFilteredStock = () => {
    return products.filter(p => {
      if (!filterByBranchAndDate(p.created_at, p.branch_id)) return false;
      const supplierName = dealerMap[p.dealer_id] || 'Direct';
      return matchSearch([p.design_number, p.color, p.category, supplierName, p.branches?.name]);
    });
  };

  // 2. Sale Report
  const getFilteredSalesItems = () => {
    const itemsList = [];
    bills.forEach(bill => {
      if (!filterByBranchAndDate(bill.created_at, bill.branch_id)) return;
      
      (bill.bill_items || []).forEach(bi => {
        const prod = bi.products || {};
        const supplierName = dealerMap[prod.dealer_id] || 'Direct / Unknown';
        const buyDate = prod.created_at ? new Date(prod.created_at).toLocaleDateString('en-IN') : '-';
        const saleDate = bill.created_at ? new Date(bill.created_at).toLocaleDateString('en-IN') : '-';
        const cost = Number(prod.purchase_price || 0) * bi.quantity;
        const salePrice = Number(bi.price_at_sale || 0) * bi.quantity;
        const profit = salePrice - cost;

        if (matchSearch([prod.design_number, prod.category, supplierName, bill.customer_name, bill.customer_phone, bill.payment_method])) {
          itemsList.push({
            id: bi.id,
            buyDate,
            saleDate,
            supplier: supplierName,
            customer: bill.customer_name || 'Walk-in',
            contact: bill.customer_phone || '-',
            design: prod.design_number || 'Item',
            qty: bi.quantity,
            cost,
            salePrice,
            profit,
            paymentMethod: bill.payment_method || 'Cash'
          });
        }
      });
    });
    return itemsList;
  };

  // 3. Payment Report
  const getFilteredPaymentStats = () => {
    let cashRev = 0, upiRev = 0, splitRev = 0;
    let cashCount = 0, upiCount = 0, splitCount = 0;

    bills.forEach(b => {
      if (!filterByBranchAndDate(b.created_at, b.branch_id)) return;
      if (!matchSearch([b.customer_name, b.customer_phone, b.id])) return;

      const pm = (b.payment_method || '').toLowerCase();
      if (pm === 'cash') {
        cashRev += Number(b.total_amount);
        cashCount++;
      } else if (pm === 'upi') {
        upiRev += Number(b.total_amount);
        upiCount++;
      } else {
        splitRev += Number(b.total_amount);
        splitCount++;
      }
    });

    return [
      { mode: '💵 Cash', count: cashCount, revenue: cashRev },
      { mode: '📱 UPI', count: upiCount, revenue: upiRev },
      { mode: '🔄 Both (Split)', count: splitCount, revenue: splitRev }
    ].filter(s => s.count > 0 || s.revenue > 0);
  };

  // 4. Branch Wise Report
  const getFilteredBranchStats = () => {
    const map = {};
    branches.forEach(b => {
      map[b.id] = { name: b.name, revenue: 0, billsCount: 0, stockItems: 0 };
    });

    bills.forEach(b => {
      if (!filterByBranchAndDate(b.created_at, b.branch_id)) return;
      if (map[b.branch_id]) {
        map[b.branch_id].revenue += Number(b.total_amount);
        map[b.branch_id].billsCount++;
      }
    });

    products.forEach(p => {
      if (map[p.branch_id]) {
        map[p.branch_id].stockItems += p.quantity;
      }
    });

    return Object.values(map).filter(b => matchSearch([b.name]));
  };

  // 5. Purchase Report
  const getFilteredPurchases = () => {
    const list = [];
    purchases.forEach(p => {
      if (!filterByBranchAndDate(p.date || p.created_at, p.branch_id)) return;
      const prod = products.find(prod => prod.id === p.product_id) || {};
      const supplierName = dealerMap[p.dealer_id] || dealerMap[prod.dealer_id] || 'Direct';
      
      if (matchSearch([prod.design_number, prod.category, supplierName])) {
        list.push({
          id: p.id,
          dateStr: (p.date || p.created_at) ? new Date(p.date || p.created_at).toLocaleDateString('en-IN') : '-',
          supplier: supplierName,
          design: prod.design_number || 'Unknown',
          category: prod.category || 'Apparel',
          qty: p.quantity,
          price: Number(p.purchase_price),
          total: Number(p.quantity) * Number(p.purchase_price)
        });
      }
    });
    return list;
  };

  // 6. Profit & Loss Report
  const getFilteredProfitLoss = () => {
    const dateMap = {};

    bills.forEach(b => {
      if (!filterByBranchAndDate(b.created_at, b.branch_id)) return;
      const d = new Date(b.created_at).toLocaleDateString('en-IN');
      if (!dateMap[d]) dateMap[d] = { date: d, revenue: 0, cogs: 0, expenses: 0 };
      dateMap[d].revenue += Number(b.total_amount);

      (b.bill_items || []).forEach(bi => {
        const prod = bi.products || {};
        dateMap[d].cogs += Number(prod.purchase_price || 0) * bi.quantity;
      });
    });

    expenses.forEach(e => {
      if (!filterByBranchAndDate(e.expense_date || e.created_at, e.branch_id)) return;
      const d = new Date(e.expense_date || e.created_at).toLocaleDateString('en-IN');
      if (!dateMap[d]) dateMap[d] = { date: d, revenue: 0, cogs: 0, expenses: 0 };
      dateMap[d].expenses += Number(e.amount);
    });

    return Object.values(dateMap).map(item => ({
      ...item,
      net: item.revenue - item.cogs - item.expenses
    })).filter(pl => matchSearch([pl.date]));
  };

  // 7. Product Wise Report
  const getFilteredProductStats = () => {
    const map = {};
    products.forEach(p => {
      if (!filterByBranchAndDate(p.created_at, p.branch_id)) return;
      const cat = p.category || 'Other';
      if (!map[cat]) map[cat] = { category: cat, sold: 0, revenue: 0, stock: 0 };
      map[cat].stock += p.quantity;
    });

    bills.forEach(b => {
      if (!filterByBranchAndDate(b.created_at, b.branch_id)) return;
      (b.bill_items || []).forEach(bi => {
        const prod = bi.products || {};
        const cat = prod.category || 'Other';
        if (!map[cat]) map[cat] = { category: cat, sold: 0, revenue: 0, stock: 0 };
        map[cat].sold += bi.quantity;
        map[cat].revenue += Number(bi.price_at_sale || 0) * bi.quantity;
      });
    });

    return Object.values(map).filter(ps => matchSearch([ps.category]));
  };

  // 8. All Transactions Report
  const getFilteredTransactions = () => {
    const list = [];
    bills.forEach(b => {
      if (!filterByBranchAndDate(b.created_at, b.branch_id)) return;
      if (matchSearch([b.id, b.customer_name, b.customer_phone, 'Sale'])) {
        list.push({
          id: `bill-${b.id}`,
          dateStr: new Date(b.created_at).toLocaleString('en-IN'),
          rawDate: new Date(b.created_at),
          type: '🛍️ Sale Receipt',
          ref: b.id.slice(0, 8).toUpperCase(),
          party: `${b.customer_name || 'Walk-in'} (${b.customer_phone || '-'})`,
          mode: b.payment_method || 'Cash',
          amount: Number(b.total_amount),
          isPositive: true
        });
      }
    });

    expenses.forEach(e => {
      if (!filterByBranchAndDate(e.expense_date || e.created_at, e.branch_id)) return;
      if (matchSearch([e.category, e.description, 'Expense'])) {
        list.push({
          id: `exp-${e.id}`,
          dateStr: new Date(e.expense_date || e.created_at).toLocaleString('en-IN'),
          rawDate: new Date(e.expense_date || e.created_at),
          type: '💸 Shop Expense',
          ref: e.category,
          party: e.description,
          mode: e.payment_method || 'Cash',
          amount: Number(e.amount),
          isPositive: false
        });
      }
    });

    list.sort((a, b) => b.rawDate - a.rawDate);
    return list;
  };

  // Chart Rendering Helper
  const renderChart = (chartType, data, xKey, yKey, yKey2 = null) => {
    if (!data || data.length === 0) return null;
    return (
      <div className="chart-container" style={{ width: '100%', height: 320, marginBottom: '24px', background: 'var(--white)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartsTooltip />
              <Legend />
              <Bar dataKey={yKey} fill="var(--gold)" radius={[4, 4, 0, 0]} name={yKey} />
              {yKey2 && <Bar dataKey={yKey2} fill="var(--dark)" radius={[4, 4, 0, 0]} name={yKey2} />}
            </BarChart>
          ) : chartType === 'pie' ? (
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" outerRadius={100} dataKey={yKey} nameKey={xKey} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip />
              <Legend />
            </PieChart>
          ) : (
            <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartsTooltip />
              <Legend />
              <Line type="monotone" dataKey={yKey} stroke="var(--gold)" strokeWidth={3} dot={{ r: 4 }} name={yKey} />
              {yKey2 && <Line type="monotone" dataKey={yKey2} stroke="var(--success)" strokeWidth={3} dot={{ r: 4 }} name={yKey2} />}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  };

  const renderActiveReportTable = () => {
    if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading report data...</div>;
    if (error) return <div className="alert alert-danger">{error}</div>;

    if (currentReport === 'stock') {
      const data = getFilteredStock();
      return (
        <div>
          {renderChart('bar', data.slice(0, 15).map(p => ({ Design: p.design_number, Qty: p.quantity })), 'Design', 'Qty')}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Supplier Name</th><th>Design Number</th><th>Color</th><th>Category</th><th>Cost Price</th><th>Sell Price</th><th>Stock Qty</th></tr></thead>
              <tbody>
                {data.map(p => (
                  <tr key={p.id}>
                    <td>{p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN') : '-'}</td>
                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>🏢 {dealerMap[p.dealer_id] || 'Direct'}</td>
                    <td><strong>{p.design_number}</strong></td>
                    <td>{p.color}</td>
                    <td><span className="badge badge-secondary">{p.category}</span></td>
                    <td>₹{Number(p.purchase_price).toLocaleString('en-IN')}</td>
                    <td style={{ color: 'var(--success)', fontWeight: 700 }}>₹{Number(p.selling_price).toLocaleString('en-IN')}</td>
                    <td><span className={`badge ${p.quantity > 0 ? 'badge-green' : 'badge-red'}`}>{p.quantity} Units</span></td>
                  </tr>
                ))}
                {data.length === 0 && <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>No stock records match filter</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (currentReport === 'sales') {
      const data = getFilteredSalesItems();
      const totalRev = data.reduce((s, i) => s + i.salePrice, 0);
      const totalProfit = data.reduce((s, i) => s + i.profit, 0);

      return (
        <div>
          <div className="stat-grid" style={{ marginBottom: '20px' }}>
            <div className="stat-card"><div className="label">Total Items Sold</div><div className="value">{data.reduce((s, i) => s + i.qty, 0)} Units</div></div>
            <div className="stat-card"><div className="label">Total Sales Revenue</div><div className="value">₹{totalRev.toLocaleString('en-IN')}</div></div>
            <div className="stat-card"><div className="label">Total Net Profit</div><div className="value" style={{ color: 'var(--success)' }}>₹{totalProfit.toLocaleString('en-IN')}</div></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Buy Date</th><th>Sale Date</th><th>Supplier</th><th>Customer</th><th>Contact</th><th>Design (Qty)</th><th>Cost</th><th>Sale Price</th><th>Profit</th><th>Mode</th></tr></thead>
              <tbody>
                {data.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.buyDate}</td>
                    <td style={{ fontWeight: 600 }}>{item.saleDate}</td>
                    <td style={{ color: 'var(--primary)' }}>{item.supplier}</td>
                    <td>👤 {item.customer}</td>
                    <td>{item.contact}</td>
                    <td><strong>{item.design}</strong> ({item.qty})</td>
                    <td>₹{item.cost.toLocaleString('en-IN')}</td>
                    <td style={{ fontWeight: 700 }}>₹{item.salePrice.toLocaleString('en-IN')}</td>
                    <td style={{ color: item.profit >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>₹{item.profit.toLocaleString('en-IN')}</td>
                    <td><span className="badge badge-blue">{item.paymentMethod}</span></td>
                  </tr>
                ))}
                {data.length === 0 && <tr><td colSpan="10" style={{ textAlign: 'center', padding: '20px' }}>No sales records match filter</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (currentReport === 'payment') {
      const data = getFilteredPaymentStats();
      return (
        <div>
          {renderChart('pie', data.map(d => ({ name: d.mode, value: d.revenue })), 'name', 'value')}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Payment Mode</th><th>Total Transactions</th><th>Total Revenue Generated</th></tr></thead>
              <tbody>
                {data.map((d, idx) => (
                  <tr key={idx}>
                    <td style={{ fontSize: '15px', fontWeight: 600 }}>{d.mode}</td>
                    <td>{d.count} Bills</td>
                    <td style={{ fontSize: '16px', fontWeight: 700, color: 'var(--dark)' }}>₹{d.revenue.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {data.length === 0 && <tr><td colSpan="3" style={{ textAlign: 'center', padding: '20px' }}>No payment data matches filter</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (currentReport === 'branch') {
      const data = getFilteredBranchStats();
      return (
        <div>
          {renderChart('bar', data.map(b => ({ Branch: b.name, Revenue: b.revenue })), 'Branch', 'Revenue')}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Branch Name</th><th>Total Revenue</th><th>Total Bills Handled</th><th>Current Stock Items</th></tr></thead>
              <tbody>
                {data.map((b, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600, fontSize: '15px' }}>🏪 {b.name}</td>
                    <td style={{ color: 'var(--success)', fontWeight: 700, fontSize: '15px' }}>₹{b.revenue.toLocaleString('en-IN')}</td>
                    <td>{b.billsCount} Bills</td>
                    <td>{b.stockItems} Units</td>
                  </tr>
                ))}
                {data.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>No branch data matches filter</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (currentReport === 'purchase') {
      const data = getFilteredPurchases();
      const totalCost = data.reduce((s, p) => s + p.total, 0);
      return (
        <div>
          <div className="stat-grid" style={{ marginBottom: '20px' }}>
            <div className="stat-card"><div className="label">Total Purchases Logged</div><div className="value">{data.length} Records</div></div>
            <div className="stat-card"><div className="label">Total Units Inflow</div><div className="value">{data.reduce((s, p) => s + p.qty, 0)} Units</div></div>
            <div className="stat-card"><div className="label">Total Stock Expenditure</div><div className="value" style={{ color: 'var(--danger)' }}>₹{totalCost.toLocaleString('en-IN')}</div></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Purchase Date</th><th>Supplier Name</th><th>Design Number</th><th>Category</th><th>Qty Bought</th><th>Unit Price</th><th>Total Cost</th></tr></thead>
              <tbody>
                {data.map((p, idx) => (
                  <tr key={idx}>
                    <td>{p.dateStr}</td>
                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>🏢 {p.supplier}</td>
                    <td><strong>{p.design}</strong></td>
                    <td><span className="badge badge-secondary">{p.category}</span></td>
                    <td>{p.qty} Units</td>
                    <td>₹{p.price.toLocaleString('en-IN')}</td>
                    <td style={{ fontWeight: 700, color: 'var(--danger)' }}>₹{p.total.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {data.length === 0 && <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>No purchase records match filter</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (currentReport === 'profit') {
      const data = getFilteredProfitLoss();
      const totalRev = data.reduce((s, d) => s + d.revenue, 0);
      const totalCogs = data.reduce((s, d) => s + d.cogs, 0);
      const totalExp = data.reduce((s, d) => s + d.expenses, 0);
      const netProfit = totalRev - totalCogs - totalExp;

      return (
        <div>
          <div className="stat-grid" style={{ marginBottom: '20px' }}>
            <div className="stat-card"><div className="label">Total Sales Revenue</div><div className="value">₹{totalRev.toLocaleString('en-IN')}</div></div>
            <div className="stat-card"><div className="label">COGS + Shop Expenses</div><div className="value" style={{ color: 'var(--danger)' }}>₹{(totalCogs + totalExp).toLocaleString('en-IN')}</div></div>
            <div className="stat-card"><div className="label">True Net Profit / Loss</div><div className="value" style={{ color: netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>₹{netProfit.toLocaleString('en-IN')}</div></div>
          </div>
          {renderChart('line', data.map(d => ({ Date: d.date, Revenue: d.revenue, NetProfit: d.net })), 'Date', 'Revenue', 'NetProfit')}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Sales Revenue</th><th>Cost of Goods Sold (COGS)</th><th>Shop Expenses</th><th>Net Profit / Loss</th></tr></thead>
              <tbody>
                {data.map((d, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600 }}>{d.date}</td>
                    <td style={{ color: 'var(--success)', fontWeight: 600 }}>₹{d.revenue.toLocaleString('en-IN')}</td>
                    <td>₹{d.cogs.toLocaleString('en-IN')}</td>
                    <td style={{ color: 'var(--danger)' }}>₹{d.expenses.toLocaleString('en-IN')}</td>
                    <td style={{ fontWeight: 700, color: d.net >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: '15px' }}>
                      {d.net >= 0 ? '+ ' : ''}₹{d.net.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
                {data.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>No profit/loss data matches filter</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (currentReport === 'product') {
      const data = getFilteredProductStats();
      return (
        <div>
          {renderChart('bar', data.map(p => ({ Category: p.category, Sold: p.sold })), 'Category', 'Sold')}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Category / Type</th><th>Total Units Sold</th><th>Total Revenue Generated</th><th>Current Stock Remaining</th></tr></thead>
              <tbody>
                {data.map((p, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600, fontSize: '15px' }}>👕 {p.category}</td>
                    <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{p.sold} Units</td>
                    <td style={{ fontWeight: 700, color: 'var(--success)' }}>₹{p.revenue.toLocaleString('en-IN')}</td>
                    <td><span className={`badge ${p.stock > 0 ? 'badge-green' : 'badge-red'}`}>{p.stock} Units left</span></td>
                  </tr>
                ))}
                {data.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>No product data matches filter</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (currentReport === 'transactions') {
      const data = getFilteredTransactions();
      return (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date & Time</th><th>Type</th><th>Reference ID</th><th>Party / Description</th><th>Payment Mode</th><th>Amount</th></tr></thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontSize: '12px' }}>{t.dateStr}</td>
                  <td style={{ fontWeight: 600 }}>{t.type}</td>
                  <td><code>{t.ref}</code></td>
                  <td style={{ maxWidth: '250px' }}>{t.party}</td>
                  <td><span className="badge badge-blue">{t.mode}</span></td>
                  <td style={{ fontWeight: 700, fontSize: '14px', color: t.isPositive ? 'var(--success)' : 'var(--danger)' }}>
                    {t.isPositive ? '+ ' : '- '}₹{t.amount.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>No transactions match filter</td></tr>}
            </tbody>
          </table>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="page active" id="reports-page">
      <div className="page-title">Analytics & Enterprise Reports</div>
      <div className="page-sub">Comprehensive financial, inventory, and branch performance insights</div>
      
      {/* Report Selection Grid */}
      <div className="report-grid">
        {reportsList.map((r) => {
          const isSelected = currentReport === r.key;
          return (
            <div 
              key={r.key} 
              className={`report-btn ${isSelected ? 'active' : ''}`}
              onClick={() => setCurrentReport(r.key)}
              style={isSelected ? { borderColor: 'var(--gold)', backgroundColor: '#FDFBF7' } : {}}
            >
              <div>
                <div className="r-icon">{r.icon}</div>
                <div className="r-title">{r.title}</div>
              </div>
              <div className="r-desc">{r.desc}</div>
            </div>
          );
        })}
      </div>
      
      {/* Filter & Search Bar */}
      <div className="card no-print" style={{ padding: '20px 24px', marginBottom: '28px', backgroundColor: '#FAFAFA', borderRadius: '12px', border: '1px solid var(--border)' }}>
        
        {/* Search Bar Row */}
        <div style={{ marginBottom: '16px' }}>
          <input 
            type="text" 
            className="form-control" 
            placeholder="🔍 Search across active report records (e.g. design number, supplier, customer name, phone, category)..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', marginBottom: 0, backgroundColor: 'var(--white)', padding: '12px 18px', fontSize: '14px', borderRadius: '8px', border: '1.5px solid var(--border)' }}
          />
        </div>

        {/* Date Ranges and Branch Filter Row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between', paddingTop: '16px', borderTop: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dark)' }}>📅 From Date:</span>
              <input type="date" className="form-control" style={{ width: 'auto', marginBottom: 0, padding: '8px 12px', borderRadius: '6px' }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dark)' }}>📅 To Date:</span>
              <input type="date" className="form-control" style={{ width: 'auto', marginBottom: 0, padding: '8px 12px', borderRadius: '6px' }} value={toDate} onChange={e => setToDate(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            {user?.role === 'superadmin' && (
              <select className="form-control" style={{ width: 'auto', minWidth: '180px', marginBottom: 0, padding: '8px 14px', fontWeight: 600, borderRadius: '6px' }} value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}>
                <option value="all">🌐 All Branches</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>🏪 {b.name}</option>
                ))}
              </select>
            )}

            {(searchQuery || fromDate || toDate || selectedBranch !== 'all') && (
              <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '6px', fontWeight: 600 }} onClick={() => { setSearchQuery(''); setFromDate(''); setToDate(''); setSelectedBranch('all'); }}>
                🔄 Reset Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Report Output Area */}
      <div className="report-output card" style={{ padding: '24px' }}>
        
        {/* Printable Header */}
        <div className="print-only" style={{ textAlign: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '2px solid #000' }}>
          <img src="/images/logo%20black.png" alt="Kiddorin Logo" style={{ maxWidth: '180px', maxHeight: '60px', objectFit: 'contain', display: 'block', margin: '0 auto 8px auto' }} />
          <div style={{ fontSize: '18px', fontWeight: 700 }}>{titles[currentReport]}</div>
          <div style={{ fontSize: '11px', color: '#666' }}>Generated on: {new Date().toLocaleString('en-IN')} | Filter Range: {fromDate || 'Start'} to {toDate || 'Present'}</div>
        </div>

        {/* Screen Header */}
        <div className="report-header no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '20px', color: 'var(--dark)' }}>{titles[currentReport]}</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Showing filtered real-time records</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={exportCSV}>⬇️ Export CSV</button>
            <button className="btn btn-primary" onClick={() => { toast.dismiss(); window.print(); }}>🖨️ Print Report</button>
          </div>
        </div>

        {/* Dynamic Table & Chart Content */}
        {renderActiveReportTable()}

      </div>
    </div>
  );
};

export default Reports;
