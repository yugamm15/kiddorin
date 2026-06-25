import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import toast from 'react-hot-toast';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';

const COLORS = ['#C5A059', '#1E4620', '#003366', '#8B0000', '#CC5500', '#666666', '#00C49F', '#FFBB28', '#FF8042'];

const Reports = () => {
  const { user } = useAuth();
  const [currentReport, setCurrentReport] = useState(null);
  
  const [reportData, setReportData] = useState({ bills: [], products: [], allBills: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const titles = {
    sales: '📊 Sales Report', 
    stock: '📦 Stock Report', 
    lowstock: '⚠️ Low Stock Alert',
    purchase: '🛒 Purchase Report', 
    payment: '💳 Payment Report', 
    profit: '💰 Profit & Loss Report',
    product: '👕 Product-wise Dist.', 
    branch: '🏪 Branch-wise Report', 
    transactions: '🧾 All Transactions'
  };

  const showReport = async (type) => {
    setCurrentReport(type);
    setLoading(true);
    setError(null);
    
    try {
      const { data: billsData, error: billsError } = await supabase.from('bills').select('*').eq('branch_id', user.branch_id);
      if (billsError) throw billsError;
      
      const { data: productsData, error: productsError } = await supabase.from('products').select('*').eq('branch_id', user.branch_id);
      if (productsError) throw productsError;
      
      let allBillsData = [];
      if (type === 'branch') {
        const { data, error: allBillsError } = await supabase.from('bills').select('*, branches(name)');
        if (allBillsError) throw allBillsError;
        allBillsData = data || [];
      }

      setReportData({
        bills: billsData || [],
        products: productsData || [],
        allBills: allBillsData
      });
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!reportData) return;
    const { bills, products, allBills } = reportData;
    let rows = [];

    if (currentReport === 'sales' || currentReport === 'transactions') {
      rows.push(["Bill ID", "Total Amount", "Payment Method", "Date"]);
      bills.forEach(b => {
        rows.push([b.id, b.total_amount, b.payment_method || 'N/A', new Date(b.created_at).toLocaleString('en-IN')]);
      });
    } else if (currentReport === 'stock') {
      rows.push(["Design Number", "Category", "Gender", "Color", "Size", "Quantity", "Selling Price", "Status"]);
      products.forEach(p => {
        rows.push([p.design_number, p.category, p.gender, p.color, p.size, p.quantity, p.selling_price, p.quantity > 0 ? 'In Stock' : 'Out']);
      });
    } else if (currentReport === 'lowstock') {
      const lowStock = products.filter(p => p.quantity < 5);
      rows.push(["Design Number", "Category", "Color", "Size", "Quantity Left"]);
      lowStock.forEach(p => {
        rows.push([p.design_number, p.category, p.color, p.size, p.quantity]);
      });
    } else if (currentReport === 'payment') {
      const cash = bills.filter(b => b.payment_method?.toLowerCase() === 'cash').reduce((a, b) => a + Number(b.total_amount), 0);
      const upi = bills.filter(b => b.payment_method?.toLowerCase() === 'upi').reduce((a, b) => a + Number(b.total_amount), 0);
      rows.push(["Payment Method", "Total Revenue"]);
      rows.push(["Cash", cash]);
      rows.push(["UPI", upi]);
    } else if (currentReport === 'profit') {
      rows.push(["Date", "Total Revenue", "Estimated Profit (35%)"]);
      const salesByDate = bills.reduce((acc, bill) => {
        const date = new Date(bill.created_at).toLocaleDateString('en-IN');
        acc[date] = (acc[date] || 0) + Number(bill.total_amount);
        return acc;
      }, {});
      Object.entries(salesByDate).forEach(([date, rev]) => {
        rows.push([date, rev, rev * 0.35]);
      });
    } else if (currentReport === 'branch') {
      rows.push(["Branch Name", "Total Revenue"]);
      const branchSales = allBills.reduce((acc, b) => {
        const bName = b.branches?.name || 'Main Store';
        acc[bName] = (acc[bName] || 0) + Number(b.total_amount);
        return acc;
      }, {});
      Object.entries(branchSales).forEach(([name, rev]) => {
        rows.push([name, rev]);
      });
    } else if (currentReport === 'product' || currentReport === 'purchase') {
      rows.push(["Category", "Number of Unique Products"]);
      const catDist = products.reduce((acc, p) => {
        acc[p.category] = (acc[p.category] || 0) + 1;
        return acc;
      }, {});
      Object.entries(catDist).forEach(([cat, count]) => {
        rows.push([cat, count]);
      });
    }

    if (rows.length === 0) {
      toast.error("No data available to export.");
      return;
    }

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${currentReport}_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success("CSV file downloaded successfully!");
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ backgroundColor: '#fff', border: '1px solid var(--border)', padding: '10px', fontSize: '12px' }}>
          <p style={{ fontWeight: 600, marginBottom: '5px' }}>{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString('en-IN') : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderChartContainer = (chartType, data, xKey, yKey, yKey2 = null) => {
    if (!data || data.length === 0) return <div style={{textAlign: 'center', padding: '20px', color: 'var(--text-muted)'}}>No data available for chart</div>;

    return (
      <div className="chart-container" style={{ width: '100%', height: 350, marginBottom: '40px', background: 'var(--white)', padding: '20px', borderRadius: '4px', border: '1px solid var(--border)' }}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
              <XAxis dataKey={xKey} tick={{fontSize: 11}} axisLine={false} tickLine={false} />
              <YAxis tick={{fontSize: 11}} axisLine={false} tickLine={false} />
              <RechartsTooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              <Bar dataKey={yKey} fill="var(--gold)" radius={[4, 4, 0, 0]} />
              {yKey2 && <Bar dataKey={yKey2} fill="var(--dark)" radius={[4, 4, 0, 0]} />}
            </BarChart>
          ) : chartType === 'pie' ? (
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" outerRadius={110} dataKey={yKey} nameKey={xKey} label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
            </PieChart>
          ) : (
            <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
              <XAxis dataKey={xKey} tick={{fontSize: 11}} axisLine={false} tickLine={false} />
              <YAxis tick={{fontSize: 11}} axisLine={false} tickLine={false} />
              <RechartsTooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              <Line type="monotone" dataKey={yKey} stroke="var(--gold)" strokeWidth={3} dot={{ r: 4, fill: 'var(--gold)' }} activeDot={{ r: 6 }} />
              {yKey2 && <Line type="monotone" dataKey={yKey2} stroke="var(--success)" strokeWidth={3} dot={{ r: 4, fill: 'var(--success)' }} />}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  };

  const renderContent = () => {
    if (loading) return (
      <div style={{ marginTop: '24px' }}>
        <div className="skeleton skeleton-title" style={{ width: '200px' }}></div>
        <div className="chart-container skeleton" style={{ width: '100%', height: 350, marginBottom: '40px', borderRadius: '4px' }}></div>
        <div className="skeleton skeleton-title" style={{ width: '150px' }}></div>
        <div className="table-wrap">
          {[...Array(5)].map((_, i) => (
            <div className="skeleton skeleton-table-row" key={i} style={{ borderBottom: '1px solid var(--border)' }}></div>
          ))}
        </div>
      </div>
    );
    if (error) return <div className="alert alert-danger" style={{display: 'block'}}>Failed to load report data: {error}</div>;
    
    const { bills, products, allBills } = reportData;

    if (currentReport === 'sales' || currentReport === 'transactions') {
      const total = bills.reduce((a, b) => a + Number(b.total_amount), 0);
      const cash = bills.filter(b => b.payment_method?.toLowerCase() === 'cash').reduce((a, b) => a + Number(b.total_amount), 0);
      const upi = bills.filter(b => b.payment_method?.toLowerCase() === 'upi').reduce((a, b) => a + Number(b.total_amount), 0);
      
      const salesByDate = bills.reduce((acc, bill) => {
        const date = new Date(bill.created_at).toLocaleDateString('en-IN');
        acc[date] = (acc[date] || 0) + Number(bill.total_amount);
        return acc;
      }, {});
      const chartData = Object.entries(salesByDate).map(([date, revenue]) => ({ Date: date, Revenue: revenue }));

      return (
        <>
          <div className="stat-grid" style={{ marginBottom: '24px' }}>
            <div className="stat-card"><div className="label">Total Bills</div><div className="value">{bills.length}</div></div>
            <div className="stat-card"><div className="label">Total Revenue</div><div className="value">₹{total.toLocaleString('en-IN')}</div></div>
            <div className="stat-card"><div className="label">Cash / UPI</div><div className="value">₹{cash.toLocaleString('en-IN')} / ₹{upi.toLocaleString('en-IN')}</div></div>
          </div>
          {renderChartContainer(currentReport === 'sales' ? 'line' : 'bar', chartData, 'Date', 'Revenue')}
          <div className="section-title">Transactions List</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Bill #</th><th>Total</th><th>Payment</th><th>Branch</th><th>Date</th></tr></thead>
              <tbody>
                {bills.map(b => (
                  <tr key={b.id}>
                    <td><strong>{b.id}</strong></td>
                    <td>₹{Number(b.total_amount).toLocaleString('en-IN')}</td>
                    <td><span className={`badge ${b.payment_method?.toLowerCase() === 'cash' ? 'badge-green' : 'badge-blue'}`}>{b.payment_method?.toUpperCase()}</span></td>
                    <td>{user?.branch?.name}</td>
                    <td>{new Date(b.created_at).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {bills.length === 0 && <tr><td colSpan="5" style={{textAlign: 'center', padding: '20px'}}>No transactions found</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      );
    } 
    
    if (currentReport === 'stock') {
      const stockByCategory = products.reduce((acc, p) => {
        acc[p.category] = (acc[p.category] || 0) + p.quantity;
        return acc;
      }, {});
      const chartData = Object.entries(stockByCategory).map(([cat, qty]) => ({ Category: cat, Quantity: qty }));

      return (
        <>
          {renderChartContainer('pie', chartData, 'Category', 'Quantity')}
          <div className="section-title">Current Inventory</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Design</th><th>Category</th><th>Gender</th><th>Color</th><th>Size</th><th>Qty</th><th>Sell Price</th><th>Branch</th><th>Status</th></tr></thead>
              <tbody>
                {products.map(s => (
                  <tr key={s.id}>
                    <td>{s.design_number}</td><td>{s.category}</td><td>{s.gender}</td><td>{s.color}</td><td>{s.size}</td>
                    <td><strong>{s.quantity}</strong></td><td>₹{s.selling_price}</td><td>{user?.branch?.name}</td>
                    <td><span className={`badge ${s.quantity > 0 ? 'badge-green' : 'badge-red'}`}>{s.quantity > 0 ? 'In Stock' : 'Out'}</span></td>
                  </tr>
                ))}
                {products.length === 0 && <tr><td colSpan="9" style={{textAlign: 'center', padding: '20px'}}>No stock available</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      );
    }

    if (currentReport === 'lowstock') {
      const lowStock = products.filter(p => p.quantity < 5);
      const chartData = lowStock.map(p => ({ Product: `${p.category} ${p.design_number}`, Quantity: p.quantity }));
      
      return (
        <>
          {renderChartContainer('bar', chartData, 'Product', 'Quantity')}
          <div className="section-title">Low Stock Items</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Design</th><th>Category</th><th>Color</th><th>Size</th><th>Qty left</th></tr></thead>
              <tbody>
                {lowStock.map(s => (
                  <tr key={s.id}>
                    <td>{s.design_number}</td><td>{s.category}</td><td>{s.color}</td><td>{s.size}</td>
                    <td style={{color: 'var(--danger)', fontWeight: 'bold'}}>{s.quantity}</td>
                  </tr>
                ))}
                {lowStock.length === 0 && <tr><td colSpan="5" style={{textAlign: 'center', padding: '20px', color: 'var(--success)'}}>No items are low on stock!</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      );
    }

    if (currentReport === 'payment') {
      const cash = bills.filter(b => b.payment_method?.toLowerCase() === 'cash').reduce((a, b) => a + Number(b.total_amount), 0);
      const upi = bills.filter(b => b.payment_method?.toLowerCase() === 'upi').reduce((a, b) => a + Number(b.total_amount), 0);
      const chartData = [{ Method: 'Cash', Revenue: cash }, { Method: 'UPI', Revenue: upi }].filter(d => d.Revenue > 0);
      
      return (
        <>
          {renderChartContainer('pie', chartData, 'Method', 'Revenue')}
          <div className="section-title">Payment Methods Breakdown</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Payment Method</th><th>Total Revenue</th><th>% of Total</th></tr></thead>
              <tbody>
                <tr>
                  <td><strong>Cash</strong></td>
                  <td>₹{cash.toLocaleString('en-IN')}</td>
                  <td>{((cash / (cash + upi || 1)) * 100).toFixed(1)}%</td>
                </tr>
                <tr>
                  <td><strong>UPI</strong></td>
                  <td>₹{upi.toLocaleString('en-IN')}</td>
                  <td>{((upi / (cash + upi || 1)) * 100).toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      );
    }

    if (currentReport === 'profit') {
      const salesByDate = bills.reduce((acc, bill) => {
        const date = new Date(bill.created_at).toLocaleDateString('en-IN');
        acc[date] = (acc[date] || 0) + Number(bill.total_amount);
        return acc;
      }, {});
      
      const chartData = Object.entries(salesByDate).map(([date, rev]) => ({ Date: date, Revenue: rev, Profit: rev * 0.35 }));
      
      return (
        <>
          {renderChartContainer('line', chartData, 'Date', 'Revenue', 'Profit')}
          <div className="alert alert-success" style={{display: 'block', marginBottom: '24px'}}>Note: Profit is calculated at an estimated 35% margin for mock purposes.</div>
          <div className="section-title">Estimated Daily Profit</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Total Revenue</th><th>Estimated Profit (35%)</th></tr></thead>
              <tbody>
                {chartData.map((d, i) => (
                  <tr key={i}>
                    <td>{d.Date}</td>
                    <td>₹{d.Revenue.toLocaleString('en-IN')}</td>
                    <td style={{color: 'var(--success)', fontWeight: 'bold'}}>₹{d.Profit.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {chartData.length === 0 && <tr><td colSpan="3" style={{textAlign: 'center', padding: '20px'}}>No data available</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      );
    }

    if (currentReport === 'branch') {
      const branchSales = allBills.reduce((acc, b) => {
        const bName = b.branches?.name || 'Main Store';
        acc[bName] = (acc[bName] || 0) + Number(b.total_amount);
        return acc;
      }, {});
      
      const chartData = Object.entries(branchSales).map(([name, revenue]) => ({ Branch: name, Revenue: revenue }));
      
      return (
        <>
          {renderChartContainer('bar', chartData, 'Branch', 'Revenue')}
          <div className="section-title">Branch Performance</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Branch Name</th><th>Total Revenue</th></tr></thead>
              <tbody>
                {chartData.map((d, i) => (
                  <tr key={i}>
                    <td><strong>{d.Branch}</strong></td>
                    <td>₹{d.Revenue.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {chartData.length === 0 && <tr><td colSpan="2" style={{textAlign: 'center', padding: '20px'}}>No data available</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      );
    }

    if (currentReport === 'product' || currentReport === 'purchase') {
      const catDist = products.reduce((acc, p) => {
        acc[p.category] = (acc[p.category] || 0) + 1;
        return acc;
      }, {});
      const chartData = Object.entries(catDist).map(([cat, count]) => ({ Category: cat, Products: count }));

      return (
        <>
          {renderChartContainer('bar', chartData, 'Category', 'Products')}
          <div className="section-title">Product Catalog Distribution</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Category</th><th>Number of Unique Products</th></tr></thead>
              <tbody>
                {chartData.map((d, i) => (
                  <tr key={i}>
                    <td>{d.Category}</td>
                    <td>{d.Products}</td>
                  </tr>
                ))}
                {chartData.length === 0 && <tr><td colSpan="2" style={{textAlign: 'center', padding: '20px'}}>No data available</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      );
    }

    return <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Data unavailable for this report type yet.</div>;
  };

  return (
    <div className="page active" id="reports-page">
      <div className="page-title">Reports & Analytics</div>
      <div className="page-sub">Generate and export interactive charts and tables</div>
      
      <div className="report-grid">
        {Object.entries(titles).map(([key, title]) => (
          <div key={key} className="report-btn" onClick={() => showReport(key)}>
            <div className="r-icon">{title.split(' ')[0]}</div>
            <div className="r-title">{title.substring(title.indexOf(' ') + 1)}</div>
            <div className="r-desc">Generate {title.substring(title.indexOf(' ') + 1)}</div>
          </div>
        ))}
      </div>
      
      {currentReport && (
        <div className="report-output" id="report-output" style={{ marginTop: '32px' }}>
          
          {/* Printable Document Header */}
          <div className="print-only" style={{ textAlign: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '2px solid #000' }}>
            <h1 style={{ fontFamily: 'Playfair Display', margin: 0, fontSize: '28px' }}>Kiddorin</h1>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '2px', marginTop: '4px' }}>The World in Their Wardrobe</div>
            <div style={{ fontSize: '16px', marginTop: '12px', fontWeight: 600 }}>{titles[currentReport].replace(/[^a-zA-Z &]/g, '').trim()}</div>
            <div style={{ fontSize: '11px', marginTop: '4px', color: '#666' }}>Generated on: {new Date().toLocaleString('en-IN')}</div>
          </div>

          <div className="report-header no-print">
            <div className="recent-title" id="report-title" style={{ margin: 0, fontSize: '24px' }}>{titles[currentReport]}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={exportCSV}>⬇️ Export CSV</button>
              <button className="btn btn-primary" onClick={() => { toast.dismiss(); window.print(); }}>🖨️ Print Report</button>
            </div>
          </div>
          <div className="filter-row no-print">
            <input type="date" id="rep-from" />
            <input type="date" id="rep-to" />
            <select style={{ padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '4px', fontSize: '13px' }} disabled>
              <option>{user?.branch?.name || 'All Branches'}</option>
            </select>
            <button className="btn btn-primary" style={{ padding: '10px 24px' }}>Apply Filter</button>
          </div>
          <div id="report-body" style={{ marginTop: '24px' }}>
            {renderContent()}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
