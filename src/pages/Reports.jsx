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
  const [exchanges, setExchanges] = useState([]);

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
    { key: 'purchase', icon: '🛒', title: 'Purchase Report', desc: 'Dealer stock inflows' },
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
      let exchangesQuery = supabase.from('returns_exchanges').select('*, branches(name)').order('created_at', { ascending: false });
      
      if (user.role !== 'superadmin') {
        billsQuery = billsQuery.eq('branch_id', user.branch_id);
        productsQuery = productsQuery.eq('branch_id', user.branch_id);
        exchangesQuery = exchangesQuery.eq('branch_id', user.branch_id);
      }

      const [bRes, pRes, dRes, purRes, expRes, brRes, exRes] = await Promise.all([
        billsQuery,
        productsQuery,
        supabase.from('dealers').select('*'),
        supabase.from('purchases').select('*').order('date', { ascending: false }),
        db.getExpenses('all'),
        supabase.from('branches').select('*'),
        exchangesQuery
      ]);

      setBills(bRes.data || []);
      setProducts(pRes.data || []);
      setDealers(dRes.data || []);
      setPurchases(purRes.data || []);
      setExpenses(expRes || []);
      setBranches(brRes.data || []);
      setExchanges(exRes.data || []);
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

  const getDealerName = (dealerId, designNumber, fallback = 'Direct') => {
    if (dealerId && dealerMap[dealerId]) return dealerMap[dealerId];
    if (!designNumber) return fallback;
    
    const cleanDn = designNumber.trim().toUpperCase();
    const prefixMatch = cleanDn.match(/^([A-Z]+)/);
    if (!prefixMatch) return fallback;
    const prefix = prefixMatch[1];

    // 1. Exact match on prefix
    let matched = dealers.find(d => d.name.toUpperCase() === prefix);
    if (matched) return matched.name;

    // 2. Prefix is initials of the dealer name
    matched = dealers.find(d => {
      const words = d.name.toUpperCase().split(/\s+/);
      const initials = words.map(w => w[0]).join('');
      if (initials === prefix) return true;
      if (words.length > 1) {
        const partialInitials = words.slice(0, prefix.length).map(w => w[0]).join('');
        if (partialInitials === prefix) return true;
      }
      return false;
    });
    if (matched) return matched.name;

    // 3. Dealer name starts with prefix
    matched = dealers.find(d => d.name.toUpperCase().startsWith(prefix));
    if (matched) return matched.name;

    // 4. Special manual overrides
    if (prefix === 'HC') {
      const d = dealers.find(d => d.name.toUpperCase() === 'HUCAI');
      if (d) return d.name;
    }
    if (prefix === 'BY') {
      const d = dealers.find(d => d.name.toUpperCase() === 'BEIYA');
      if (d) return d.name;
    }

    return fallback;
  };

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
      rows.push(["Date", "Dealer Name", "Design Number", "Color", "Size", "Category", "Cost Price", "Selling Price", "Quantity"]);
      getFilteredStock().forEach(p => {
        rows.push([
          p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN') : '-',
          getDealerName(p.dealer_id, p.design_number, 'Direct / Unknown'),
          p.design_number, p.color, p.size || '-', p.category, p.purchase_price, p.selling_price, p.quantity
        ]);
      });
    } else if (currentReport === 'sales') {
      rows.push(["Type", "Date of Buy", "Date of Sale", "Dealer Name", "Design Number", "Size", "Customer Name", "Contact", "Quantity", "Cost Price", "Gross Price", "Discount", "Sale Price", "Profit", "Payment Mode"]);
      getFilteredSalesItems().forEach(item => {
        rows.push([
          item.type || 'Sale', item.buyDate, item.saleDate, item.dealer, item.design, item.size, item.customer, item.contact, item.qty, item.cost, item.grossPrice, item.discountShare, item.salePrice, item.profit, item.paymentMethod
        ]);
      });
    } else if (currentReport === 'payment') {
      rows.push(["Payment Mode", "Total Bills", "Total Revenue"]);
      getFilteredPaymentStats().forEach(s => rows.push([s.mode, s.count, s.revenue]));
    } else if (currentReport === 'branch') {
      rows.push(["Branch Name", "Total Revenue", "Total Bills", "Stock Items"]);
      getFilteredBranchStats().forEach(b => rows.push([b.name, b.revenue, b.billsCount, b.stockItems]));
    } else if (currentReport === 'purchase') {
      rows.push(["Purchase Date", "Dealer Name", "Design Number", "Category", "Quantity Bought", "Purchase Price", "Total Cost"]);
      getFilteredPurchases().forEach(p => rows.push([p.dateStr, p.dealer, p.design, p.category, p.qty, p.price, p.total]));
    } else if (currentReport === 'profit') {
      rows.push(["Date", "Sales Revenue", "Cost of Goods", "Shop Expenses", "Net Profit/Loss"]);
      getFilteredProfitLoss().forEach(pl => rows.push([pl.date, pl.revenue, pl.cogs, pl.expenses, pl.net]));
    } else if (currentReport === 'product') {
      rows.push(["Category", "Units Sold", "Revenue Generated", "Current Stock Left"]);
      getFilteredProductStats().forEach(ps => rows.push([ps.category, ps.sold, ps.revenue, ps.stock]));
    } else if (currentReport === 'transactions') {
      rows.push(["Date", "Type", "Reference ID", "Party / Description", "Payment Mode", "Gross Amount", "Discount", "Final Amount"]);
      getFilteredTransactions().forEach(t => rows.push([t.dateStr, t.type, t.ref, t.party, t.mode, t.grossAmount, t.discount, t.amount]));
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
      const dealerName = getDealerName(p.dealer_id, p.design_number, 'Direct');
      return matchSearch([p.design_number, p.color, p.size, p.category, dealerName, p.branches?.name]);
    });
  };

  // Reconstruct the discount for ANY bill (old or new) using:
  //   discount = Σ(price_at_sale × qty) − total_amount
  // total_amount was always saved as the post-discount final amount,
  // so this formula is exact — no extra DB column needed.
  const resolveBillDiscount = (bill) => {
    const itemsSum = (bill.bill_items || []).reduce(
      (s, bi) => s + (Number(bi.price_at_sale || 0) * bi.quantity), 0
    );
    const paid = Number(bill.total_amount || 0);
    const discount = itemsSum - paid;
    return discount > 0 ? Math.round(discount) : 0;
  };

  // 2. Sale Report
  const getFilteredSalesItems = () => {
    const itemsList = [];
    
    // Standard Sales
    bills.forEach(bill => {
      if (!filterByBranchAndDate(bill.created_at, bill.branch_id)) return;

      const billSubtotal = (bill.bill_items || []).reduce((s, bi) => s + (Number(bi.price_at_sale || 0) * bi.quantity), 0);
      const billDiscount = resolveBillDiscount(bill);

      (bill.bill_items || []).forEach(bi => {
        const prod = bi.products || {};
        const dealerName = getDealerName(prod.dealer_id, prod.design_number, 'Direct / Unknown');
        const buyDate = prod.created_at ? new Date(prod.created_at).toLocaleDateString('en-IN') : '-';
        const saleDate = bill.created_at ? new Date(bill.created_at).toLocaleDateString('en-IN') : '-';
        const cost = Number(prod.purchase_price || 0) * bi.quantity;
        const itemGross = Number(bi.price_at_sale || 0) * bi.quantity;
        // Proportionally distribute the bill-level discount across items
        const itemDiscountShare = billSubtotal > 0 ? Math.round((itemGross / billSubtotal) * billDiscount) : 0;
        const salePrice = itemGross - itemDiscountShare;
        const profit = salePrice - cost;

        if (matchSearch([prod.design_number, prod.size, prod.category, dealerName, bill.customer_name, bill.customer_phone, bill.payment_method])) {
          itemsList.push({
            id: bi.id,
            type: 'Sale',
            buyDate,
            saleDate,
            dealer: dealerName,
            customer: bill.customer_name || 'Walk-in',
            contact: bill.customer_phone || '-',
            design: prod.design_number || 'Item',
            size: prod.size || '-',
            qty: bi.quantity,
            cost,
            grossPrice: itemGross,
            discountShare: itemDiscountShare,
            salePrice,
            profit,
            paymentMethod: bill.payment_method || 'Cash'
          });
        }
      });
    });

    // Returns & Exchanges
    exchanges.forEach(ex => {
      if (!filterByBranchAndDate(ex.created_at, ex.branch_id)) return;

      const origBill = bills.find(b => b.id === ex.original_bill_id);
      const origItem = origBill ? (origBill.bill_items || []).find(bi => bi.product_id === ex.returned_product_id) : null;

      // Fall back to original item product details if not found in active products catalog
      const returnedProd = products.find(p => p.id === ex.returned_product_id) || (origItem?.products || {});
      const exchangedProd = products.find(p => p.id === ex.exchanged_product_id) || (ex.exchanged_product || {});
      
      const dealerNameRet = getDealerName(returnedProd.dealer_id, returnedProd.design_number, 'Direct / Unknown');
      const dealerNameExch = getDealerName(exchangedProd.dealer_id, exchangedProd.design_number, 'Direct / Unknown');
      
      const saleDate = ex.created_at ? new Date(ex.created_at).toLocaleDateString('en-IN') : '-';

      // 1. Process Return Part (Negative Sale entry to subtract from totals)
      if (ex.returned_product_id && ex.returned_qty > 0) {
        const priceAtSale = origItem ? Number(origItem.price_at_sale) : Number(returnedProd.selling_price || 0);
        const billSubtotal = origBill ? (origBill.bill_items || []).reduce((s, bi) => s + (Number(bi.price_at_sale || 0) * bi.quantity), 0) : 0;
        const billDiscount = origBill ? resolveBillDiscount(origBill) : 0;
        
        const buyDate = returnedProd.created_at ? new Date(returnedProd.created_at).toLocaleDateString('en-IN') : '-';
        const cost = -Number(returnedProd.purchase_price || 0) * ex.returned_qty;
        const itemGross = -priceAtSale * ex.returned_qty;
        
        const origItemGross = priceAtSale * ex.returned_qty;
        const itemDiscountShare = (billSubtotal > 0 && billDiscount > 0) ? Math.round((origItemGross / billSubtotal) * billDiscount) : 0;
        
        const salePrice = -(origItemGross - itemDiscountShare);
        const profit = salePrice - cost;

        if (matchSearch([returnedProd.design_number, returnedProd.size, returnedProd.category, dealerNameRet, ex.customer_name, ex.customer_phone, 'Return'])) {
          itemsList.push({
            id: `ret-item-${ex.id}`,
            type: 'Return',
            buyDate,
            saleDate,
            dealer: dealerNameRet,
            customer: `${ex.customer_name || 'Walk-in'} (Return)`,
            contact: ex.customer_phone || '-',
            design: `${returnedProd.design_number || 'Item'} (Ret)`,
            size: returnedProd.size || '-',
            qty: -ex.returned_qty,
            cost,
            grossPrice: itemGross,
            discountShare: -itemDiscountShare,
            salePrice,
            profit,
            paymentMethod: 'Return'
          });
        }
      }

      // 2. Process Exchange Part (Positive Sale entry for replacement item bought)
      if (ex.exchanged_product_id && ex.exchanged_qty > 0) {
        const buyDate = exchangedProd.created_at ? new Date(exchangedProd.created_at).toLocaleDateString('en-IN') : '-';
        const cost = Number(exchangedProd.purchase_price || 0) * ex.exchanged_qty;
        const itemGross = Number(exchangedProd.selling_price || 0) * ex.exchanged_qty;
        const itemDiscount = Number(ex.discount || 0);
        const salePrice = itemGross - itemDiscount;
        const profit = salePrice - cost;

        if (matchSearch([exchangedProd.design_number, exchangedProd.size, exchangedProd.category, dealerNameExch, ex.customer_name, ex.customer_phone, 'Exchange'])) {
          itemsList.push({
            id: `exch-item-${ex.id}`,
            type: 'Exchange Buy',
            buyDate,
            saleDate,
            dealer: dealerNameExch,
            customer: `${ex.customer_name || 'Walk-in'} (Exch)`,
            contact: ex.customer_phone || '-',
            design: `${exchangedProd.design_number || 'Item'} (Exch)`,
            size: exchangedProd.size || '-',
            qty: ex.exchanged_qty,
            cost,
            grossPrice: itemGross,
            discountShare: itemDiscount,
            salePrice,
            profit,
            paymentMethod: 'Exchange'
          });
        }
      }
    });

    return itemsList;
  };

  // 3. Payment Report
  const getFilteredPaymentStats = () => {
    let cashRev = 0, upiRev = 0;
    let cashCount = 0, upiCount = 0;

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
      } else if (pm.includes('split') || (Number(b.split_cash || 0) > 0 || Number(b.split_upi || 0) > 0)) {
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

        cashRev += sc;
        upiRev += su;
        if (sc > 0) cashCount++;
        if (su > 0) upiCount++;
      } else {
        // Fallback for store credit payment or legacy bills
        cashRev += Number(b.total_amount);
        cashCount++;
      }
    });

    exchanges.forEach(ex => {
      if (!filterByBranchAndDate(ex.created_at, ex.branch_id)) return;
      if (!matchSearch([ex.customer_name, ex.customer_phone, ex.id])) return;

      const net = Number(ex.net_amount || 0);
      const pm = (ex.payment_method || '').toLowerCase();

      if (net > 0) {
        // Customer paid extra
        if (pm.includes('cash')) {
          cashRev += net;
          cashCount++;
        } else if (pm.includes('upi') || pm.includes('gpay')) {
          upiRev += net;
          upiCount++;
        } else if (pm.includes('split')) {
          const match = pm.match(/Cash:\s*₹?([\d.]+).*?(?:GPay|UPI):\s*₹?([\d.]+)/i);
          if (match) {
            const sc = parseFloat(match[1]) || 0;
            const su = parseFloat(match[2]) || 0;
            cashRev += sc;
            upiRev += su;
            if (sc > 0) cashCount++;
            if (su > 0) upiCount++;
          } else {
            cashRev += net / 2;
            upiRev += net / 2;
            cashCount++;
            upiCount++;
          }
        } else {
          // Default fallback
          cashRev += net;
          cashCount++;
        }
      } else if (net < 0) {
        // Refund / Store credit issued (negative net) - deduct from original payment mode
        const origBill = bills.find(b => b.id === ex.original_bill_id);
        const origPm = origBill ? (origBill.payment_method || '').toLowerCase() : '';
        const absNet = Math.abs(net);

        if (origPm === 'cash') {
          cashRev -= absNet;
        } else if (origPm === 'upi') {
          upiRev -= absNet;
        } else if (origPm.includes('split')) {
          let sc = Number(origBill?.split_cash || 0);
          let su = Number(origBill?.split_upi || 0);
          if (sc === 0 && su === 0 && origPm.includes('split')) {
            const match = origPm.match(/Cash:\s*₹?([\d.]+).*?(?:GPay|UPI):\s*₹?([\d.]+)/i);
            if (match) {
              sc = parseFloat(match[1]) || 0;
              su = parseFloat(match[2]) || 0;
            }
          }
          const totalSplit = sc + su;
          if (totalSplit > 0) {
            cashRev -= absNet * (sc / totalSplit);
            upiRev -= absNet * (su / totalSplit);
          } else {
            cashRev -= absNet / 2;
            upiRev -= absNet / 2;
          }
        } else {
          // Default fallback
          cashRev -= absNet;
        }
      }
    });

    return [
      { mode: '💵 Cash', count: cashCount, revenue: cashRev },
      { mode: '📱 UPI', count: upiCount, revenue: upiRev }
    ].filter(s => s.count > 0 || s.revenue !== 0);
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

    exchanges.forEach(ex => {
      if (!filterByBranchAndDate(ex.created_at, ex.branch_id)) return;
      if (map[ex.branch_id]) {
        map[ex.branch_id].revenue += Number(ex.net_amount || 0);
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
      const dealerName = getDealerName(p.dealer_id || prod.dealer_id, p.design_number || prod.design_number, 'Direct');
      
      if (matchSearch([prod.design_number, prod.category, dealerName])) {
        list.push({
          id: p.id,
          dateStr: (p.date || p.created_at) ? new Date(p.date || p.created_at).toLocaleDateString('en-IN') : '-',
          dealer: dealerName,
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

    exchanges.forEach(ex => {
      if (!filterByBranchAndDate(ex.created_at, ex.branch_id)) return;
      const d = new Date(ex.created_at).toLocaleDateString('en-IN');
      if (!dateMap[d]) dateMap[d] = { date: d, revenue: 0, cogs: 0, expenses: 0 };
      
      dateMap[d].revenue += Number(ex.net_amount || 0);

      if (ex.returned_product_id && ex.returned_qty > 0) {
        const returnedProd = products.find(p => p.id === ex.returned_product_id);
        if (returnedProd) {
          dateMap[d].cogs -= Number(returnedProd.purchase_price || 0) * ex.returned_qty;
        }
      }
      if (ex.exchanged_product_id && ex.exchanged_qty > 0) {
        const exchangedProd = products.find(p => p.id === ex.exchanged_product_id);
        if (exchangedProd) {
          dateMap[d].cogs += Number(exchangedProd.purchase_price || 0) * ex.exchanged_qty;
        }
      }
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
      const billSubtotal = (b.bill_items || []).reduce((s, bi) => s + (Number(bi.price_at_sale || 0) * bi.quantity), 0);
      const billDiscount = resolveBillDiscount(b);
      (b.bill_items || []).forEach(bi => {
        const prod = bi.products || {};
        const cat = prod.category || 'Other';
        if (!map[cat]) map[cat] = { category: cat, sold: 0, revenue: 0, stock: 0 };
        map[cat].sold += bi.quantity;
        const itemGross = Number(bi.price_at_sale || 0) * bi.quantity;
        const itemDiscountShare = billSubtotal > 0 ? Math.round((itemGross / billSubtotal) * billDiscount) : 0;
        map[cat].revenue += itemGross - itemDiscountShare;
      });
    });

    exchanges.forEach(ex => {
      if (!filterByBranchAndDate(ex.created_at, ex.branch_id)) return;

      if (ex.returned_product_id && ex.returned_qty > 0) {
        const origBill = bills.find(b => b.id === ex.original_bill_id);
        const origItem = origBill ? (origBill.bill_items || []).find(bi => bi.product_id === ex.returned_product_id) : null;
        const returnedProd = products.find(p => p.id === ex.returned_product_id) || (origItem?.products || {});

        if (returnedProd && returnedProd.category) {
          const cat = returnedProd.category || 'Other';
          if (!map[cat]) map[cat] = { category: cat, sold: 0, revenue: 0, stock: 0 };

          const priceAtSale = origItem ? Number(origItem.price_at_sale) : Number(returnedProd.selling_price || 0);
          const billSubtotal = origBill ? (origBill.bill_items || []).reduce((s, bi) => s + (Number(bi.price_at_sale || 0) * bi.quantity), 0) : 0;
          const billDiscount = origBill ? resolveBillDiscount(origBill) : 0;
          
          const itemGross = priceAtSale * ex.returned_qty;
          const itemDiscountShare = (billSubtotal > 0 && billDiscount > 0) ? Math.round((itemGross / billSubtotal) * billDiscount) : 0;
          const netReturnVal = itemGross - itemDiscountShare;

          map[cat].sold -= ex.returned_qty;
          map[cat].revenue -= netReturnVal;
        }
      }

      if (ex.exchanged_product_id && ex.exchanged_qty > 0) {
        const exchangedProd = products.find(p => p.id === ex.exchanged_product_id);
        if (exchangedProd) {
          const cat = exchangedProd.category || 'Other';
          if (!map[cat]) map[cat] = { category: cat, sold: 0, revenue: 0, stock: 0 };

          const saleVal = (Number(exchangedProd.selling_price || 0) * ex.exchanged_qty) - Number(ex.discount || 0);
          map[cat].sold += ex.exchanged_qty;
          map[cat].revenue += saleVal;
        }
      }
    });

    return Object.values(map).filter(ps => matchSearch([ps.category]));
  };

  // 8. All Transactions Report
  const getFilteredTransactions = () => {
    const list = [];
    bills.forEach(b => {
      if (!filterByBranchAndDate(b.created_at, b.branch_id)) return;
      if (matchSearch([b.id, b.customer_name, b.customer_phone, 'Sale'])) {
        const grossAmount = (b.bill_items || []).reduce(
          (s, bi) => s + (Number(bi.price_at_sale || 0) * bi.quantity), 0
        );
        const discount = resolveBillDiscount(b);
        list.push({
          id: `bill-${b.id}`,
          dateStr: new Date(b.created_at).toLocaleString('en-IN'),
          rawDate: new Date(b.created_at),
          type: '🛍️ Sale Receipt',
          ref: b.id.slice(0, 8).toUpperCase(),
          party: `${b.customer_name || 'Walk-in'} (${b.customer_phone || '-'})`,
          mode: b.payment_method || 'Cash',
          grossAmount,
          discount,
          amount: Number(b.total_amount),
          isPositive: true
        });
      }
    });

    exchanges.forEach(ex => {
      if (!filterByBranchAndDate(ex.created_at, ex.branch_id)) return;

      const returnedProd = products.find(p => p.id === ex.returned_product_id) || {};
      const exchangedProd = products.find(p => p.id === ex.exchanged_product_id) || {};

      const descParts = [];
      if (ex.returned_product_id) {
        descParts.push(`Ret: ${returnedProd.category || 'Item'} (${returnedProd.size || ''})`);
      }
      if (ex.exchanged_product_id) {
        descParts.push(`Exch: ${exchangedProd.category || 'Item'} (${exchangedProd.size || ''})`);
      }
      const desc = descParts.join(' | ') || 'Return/Exchange';
      const party = `${ex.customer_name || 'Walk-in'} (${ex.customer_phone || '-'}) - ${desc}`;

      if (matchSearch([ex.id, ex.customer_name, ex.customer_phone, 'Return', 'Exchange', returnedProd.category, exchangedProd.category])) {
        const netAmt = Number(ex.net_amount || 0);
        const discount = Number(ex.discount || 0);

        let mode = 'Even Exchange';
        if (netAmt > 0) {
          mode = ex.payment_method ? `Paid: ${ex.payment_method}` : 'Paid Extra';
        } else if (netAmt < 0) {
          mode = ex.payment_method || 'Store Credit';
        }

        list.push({
          id: `ex-${ex.id}`,
          dateStr: new Date(ex.created_at).toLocaleString('en-IN'),
          rawDate: new Date(ex.created_at),
          type: '🔄 Return & Exchange',
          ref: ex.id.slice(0, 8).toUpperCase(),
          party,
          mode,
          grossAmount: Math.abs(netAmt) + discount,
          discount,
          amount: Math.abs(netAmt),
          isPositive: netAmt >= 0
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
          grossAmount: Number(e.amount),
          discount: 0,
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
              <thead><tr><th>Date</th><th>Dealer Name</th><th>Design Number</th><th>Color</th><th>Size</th><th>Category</th><th>Cost Price</th><th>Sell Price</th><th>Stock Qty</th></tr></thead>
              <tbody>
                {data.map(p => (
                  <tr key={p.id}>
                    <td>{p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN') : '-'}</td>
                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>🏢 {getDealerName(p.dealer_id, p.design_number, 'Direct')}</td>
                    <td><strong>{p.design_number}</strong></td>
                    <td>{p.color}</td>
                    <td>{p.size || '-'}</td>
                    <td><span className="badge badge-secondary">{p.category}</span></td>
                    <td>₹{Number(p.purchase_price).toLocaleString('en-IN')}</td>
                    <td style={{ color: 'var(--success)', fontWeight: 700 }}>₹{Number(p.selling_price).toLocaleString('en-IN')}</td>
                    <td><span className={`badge ${p.quantity > 0 ? 'badge-green' : 'badge-red'}`}>{p.quantity} Units</span></td>
                  </tr>
                ))}
                {data.length === 0 && <tr><td colSpan="9" style={{ textAlign: 'center', padding: '20px' }}>No stock records match filter</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (currentReport === 'sales') {
      const data = getFilteredSalesItems();
      const totalGross = data.reduce((s, i) => s + i.grossPrice, 0);
      const totalDiscount = data.reduce((s, i) => s + i.discountShare, 0);
      const totalRev = data.reduce((s, i) => s + i.salePrice, 0);
      const totalProfit = data.reduce((s, i) => s + i.profit, 0);

      return (
        <div>
          <div className="stat-grid" style={{ marginBottom: '20px' }}>
            <div className="stat-card"><div className="label">Total Items Sold</div><div className="value">{data.reduce((s, i) => s + i.qty, 0)} Units</div></div>
            <div className="stat-card"><div className="label">Gross Sale Value</div><div className="value">₹{totalGross.toLocaleString('en-IN')}</div></div>
            <div className="stat-card"><div className="label">Total Discount Given</div><div className="value" style={{ color: 'var(--danger)' }}>- ₹{totalDiscount.toLocaleString('en-IN')}</div></div>
            <div className="stat-card"><div className="label">Net Sales Revenue</div><div className="value">₹{totalRev.toLocaleString('en-IN')}</div></div>
            <div className="stat-card"><div className="label">Total Net Profit</div><div className="value" style={{ color: 'var(--success)' }}>₹{totalProfit.toLocaleString('en-IN')}</div></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Type</th><th>Buy Date</th><th>Sale Date</th><th>Dealer Name</th><th>Customer</th><th>Contact</th><th>Design Number</th><th>Size</th><th>Qty</th><th>Cost</th><th>Gross Price</th><th>Discount</th><th>Sale Price</th><th>Profit</th><th>Mode</th></tr></thead>
              <tbody>
                {data.map((item, idx) => {
                  const isRet = item.type === 'Return';
                  const isExch = item.type === 'Exchange Buy';
                  const fmt = (val) => {
                    if (val === 0) return '₹0';
                    if (val < 0) return `- ₹${Math.abs(val).toLocaleString('en-IN')}`;
                    return `₹${val.toLocaleString('en-IN')}`;
                  };

                  return (
                    <tr key={idx} style={isRet ? { backgroundColor: 'rgba(239, 68, 68, 0.04)' } : isExch ? { backgroundColor: 'rgba(59, 130, 246, 0.04)' } : {}}>
                      <td>
                        {isRet ? (
                          <span className="badge badge-red">🔄 Return</span>
                        ) : isExch ? (
                          <span className="badge badge-blue">🛍️ Exchange Buy</span>
                        ) : (
                          <span className="badge badge-green">✨ Sale</span>
                        )}
                      </td>
                      <td>{item.buyDate}</td>
                      <td style={{ fontWeight: 600 }}>{item.saleDate}</td>
                      <td style={{ color: 'var(--primary)' }}>{item.dealer}</td>
                      <td>👤 {item.customer}</td>
                      <td>{item.contact}</td>
                      <td><strong>{item.design}</strong></td>
                      <td>{item.size}</td>
                      <td style={{ fontWeight: 700, color: item.qty < 0 ? 'var(--danger)' : 'inherit' }}>{item.qty}</td>
                      <td style={{ color: item.cost < 0 ? 'var(--danger)' : 'inherit' }}>{fmt(item.cost)}</td>
                      <td style={{ color: item.grossPrice < 0 ? 'var(--danger)' : 'inherit' }}>{fmt(item.grossPrice)}</td>
                      <td style={{ color: item.discountShare !== 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 600 }}>
                        {item.discountShare !== 0 ? fmt(item.discountShare) : '—'}
                      </td>
                      <td style={{ fontWeight: 700, color: item.salePrice < 0 ? 'var(--danger)' : 'inherit' }}>{fmt(item.salePrice)}</td>
                      <td style={{ color: item.profit >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{fmt(item.profit)}</td>
                      <td><span className="badge badge-secondary">{item.paymentMethod}</span></td>
                    </tr>
                  );
                })}
                {data.length === 0 && <tr><td colSpan="15" style={{ textAlign: 'center', padding: '20px' }}>No sales records match filter</td></tr>}
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
              <thead><tr><th>Purchase Date</th><th>Dealer Name</th><th>Design Number</th><th>Category</th><th>Qty Bought</th><th>Unit Price</th><th>Total Cost</th></tr></thead>
              <tbody>
                {data.map((p, idx) => (
                  <tr key={idx}>
                    <td>{p.dateStr}</td>
                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>🏢 {p.dealer}</td>
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
            <thead><tr><th>Date & Time</th><th>Type</th><th>Reference ID</th><th>Party / Description</th><th>Payment Mode</th><th>Gross Amount</th><th>Discount</th><th>Final Amount</th></tr></thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontSize: '12px' }}>{t.dateStr}</td>
                  <td style={{ fontWeight: 600 }}>{t.type}</td>
                  <td><code>{t.ref}</code></td>
                  <td style={{ maxWidth: '250px' }}>{t.party}</td>
                  <td><span className="badge badge-blue">{t.mode}</span></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    {t.isPositive ? `₹${t.grossAmount.toLocaleString('en-IN')}` : `- ₹${t.grossAmount.toLocaleString('en-IN')}`}
                  </td>
                  <td style={{ color: t.discount > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 600, fontSize: '13px' }}>
                    {t.discount > 0 ? `- ₹${t.discount.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td style={{ fontWeight: 700, fontSize: '14px', color: t.isPositive ? 'var(--success)' : 'var(--danger)' }}>
                    {t.isPositive ? '+ ' : '- '}₹{t.amount.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>No transactions match filter</td></tr>}
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
            placeholder="🔍 Search across active report records (e.g. design number, dealer name, customer name, phone, category)..." 
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
