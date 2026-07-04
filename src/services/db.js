import { supabase } from './supabaseClient';
import { createClient } from '@supabase/supabase-js';
import { hashPassword } from '../utils/security';

class SupabaseDB {
  constructor() {
    this.cache = {};
  }

  async login(email, password) {
    // 1. Try Authenticating with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (!authError && authData?.user) {
      // Fetch user profile and branch details
      const { data: profile } = await supabase
        .from('users')
        .select('*, branches(*)')
        .eq('id', authData.user.id)
        .single();

      if (profile) {
        return { ...profile, branch: profile.branches };
      }
    }

    // 2. Fallback: Check users table directly by email & hashed password OR plain password (for backwards compatibility)
    const hashed = await hashPassword(password);
    let { data: fallbackProfile, error: fallbackError } = await supabase
      .from('users')
      .select('*, branches(*)')
      .eq('email', email)
      .eq('password', hashed)
      .maybeSingle();

    if (!fallbackProfile) {
      const res = await supabase
        .from('users')
        .select('*, branches(*)')
        .eq('email', email)
        .eq('password', password)
        .maybeSingle();
      fallbackProfile = res.data;
      fallbackError = res.error;
    }

    if (fallbackError || !fallbackProfile) {
      throw new Error("Invalid email or password");
    }

    return { ...fallbackProfile, branch: fallbackProfile.branches };
  }

  async addDealer(dealerData) {
    const { data, error } = await supabase
      .from('dealers')
      .insert([dealerData])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async getDealers() {
    // Fetch dealers
    const { data: dealers, error: dErr } = await supabase
      .from('dealers')
      .select('*');
    if (dErr) throw dErr;

    // Fetch purchases
    const { data: purchases, error: pErr } = await supabase
      .from('purchases')
      .select('dealer_id, quantity, purchase_price');

    // It's possible purchases table is empty or fails if schema is incomplete, so we catch it gracefully
    const validPurchases = (!pErr && purchases) ? purchases : [];

    return dealers.map(d => {
      const dealerPurchases = validPurchases.filter(p => p.dealer_id === d.id);
      const total_items = dealerPurchases.reduce((sum, p) => sum + p.quantity, 0);
      const total_spent = dealerPurchases.reduce((sum, p) => sum + (p.quantity * p.purchase_price), 0);
      return { ...d, total_items, total_spent };
    });
  }

  async addStock(productData) {
    // Check if product already exists by design_number, size, and color
    const { data: existing } = await supabase
      .from('products')
      .select('*')
      .ilike('design_number', (productData.design_number || '').trim())
      .ilike('size', (productData.size || '').trim())
      .ilike('color', (productData.color || '').trim())
      .eq('branch_id', productData.branch_id)
      .maybeSingle();

    let product_id;

    if (existing) {
      // Update quantity
      const { data, error } = await supabase
        .from('products')
        .update({
          quantity: existing.quantity + parseInt(productData.quantity),
          purchase_price: parseFloat(productData.purchase_price),
          selling_price: parseFloat(productData.selling_price)
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      product_id = data.id;
    } else {
      let newBarcode = '';
      try {
        // 1. Primary: Try calling a database function (RPC) for instant server-side calculation.
        // This is 100% accurate and takes less than 1ms even with 150,000+ rows.
        const { data, error } = await supabase.rpc('get_next_barcode');
        if (error) throw error;
        newBarcode = data;
      } catch (rpcErr) {
        console.warn("RPC 'get_next_barcode' not found or failed, falling back to client-side logic:", rpcErr.message);
        
        // 2. Fallback: Fetch the latest 200 products by creation time to find the newest barcode.
        const { data: skuRows } = await supabase
          .from('products')
          .select('barcode')
          .order('created_at', { ascending: false })
          .limit(200);
        
        let nextNum = 10001;
        if (skuRows && skuRows.length > 0) {
          skuRows.forEach(row => {
            const code = String(row.barcode || '').trim().toUpperCase();
            if (code.startsWith('P')) {
              const val = parseInt(code.substring(1), 10);
              if (!isNaN(val) && val >= 10000) {
                if (val >= nextNum) nextNum = val + 1;
              }
            }
          });
        }
        newBarcode = `P${nextNum}`;
      }

      // Insert new product
      const { data, error } = await supabase
        .from('products')
        .insert([{
          category: productData.category,
          gender: productData.gender,
          color: productData.color,
          size: productData.size,
          design_number: productData.design_number,
          barcode: newBarcode,
          purchase_price: parseFloat(productData.purchase_price),
          selling_price: parseFloat(productData.selling_price),
          quantity: parseInt(productData.quantity),
          branch_id: productData.branch_id
        }])
        .select()
        .single();
      if (error) throw error;
      product_id = data.id;
    }

    // Record the purchase
    const { error: purchaseError } = await supabase
      .from('purchases')
      .insert([{
        product_id: product_id,
        dealer_id: productData.dealer_id || null,
        branch_id: productData.branch_id,
        quantity: parseInt(productData.quantity),
        purchase_price: parseFloat(productData.purchase_price),
        date: productData.date || new Date().toISOString()
      }]);

    if (purchaseError) throw purchaseError;
    this.cache = {}; // invalidate cache on stock update
    return true;
  }

  async checkDesignExists(design_number, branch_id) {
    if (!design_number || !branch_id) return false;
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .ilike('design_number', design_number.trim())
      .eq('branch_id', branch_id)
      .limit(1);
    if (error) return false;
    return data && data.length > 0;
  }

  async getProducts(branch_id, filters = {}) {
    const hasFilters = filters.searchName || filters.searchColor || filters.searchSize;
    const cacheKey = `products_${branch_id}`;
    
    if (!hasFilters && this.cache[cacheKey] && (Date.now() - this.cache[cacheKey].ts < 10000)) {
      return this.cache[cacheKey].data;
    }

    let query = supabase
      .from('products')
      .select('*')
      .eq('branch_id', branch_id)
      .eq('is_active', true);

    if (filters.searchName) {
      const term = filters.searchName.trim();
      query = query.or(`design_number.ilike.%${term}%,category.ilike.%${term}%`);
    }
    if (filters.searchColor) {
      query = query.ilike('color', `%${filters.searchColor.trim()}%`);
    }
    if (filters.searchSize) {
      query = query.ilike('size', `%${filters.searchSize.trim()}%`);
    }

    // Always sort by created_at descending so that newly added items show up at the very top!
    query = query.order('created_at', { ascending: false });

    // Limit to 200 items to keep page rendering fast
    query = query.limit(200);

    const { data, error } = await query;
    if (error) throw error;

    if (!hasFilters) {
      this.cache[cacheKey] = { data, ts: Date.now() };
    }
    return data || [];
  }

  async deleteProduct(product_id) {
    if (!product_id) return false;
    // First delete any purchases linked to this product
    await supabase.from('purchases').delete().eq('product_id', product_id);
    // Delete the product
    const { error } = await supabase.from('products').delete().eq('id', product_id);
    if (error) throw error;
    this.cache = {}; // invalidate cache
    return true;
  }

  async reduceStock(product_id, qtyToRemove) {
    if (!product_id || qtyToRemove <= 0) return false;
    const { data: existing, error: fetchErr } = await supabase
      .from('products')
      .select('quantity')
      .eq('id', product_id)
      .single();
    if (fetchErr || !existing) throw new Error("Product not found");

    const newQty = existing.quantity - parseInt(qtyToRemove);
    if (newQty <= 0) {
      return await this.deleteProduct(product_id);
    } else {
      const { error } = await supabase
        .from('products')
        .update({ quantity: newQty })
        .eq('id', product_id);
      if (error) throw error;
      this.cache = {};
      return true;
    }
  }

  async getProductByBarcode(barcode, branch_id) {
    // Hardware scanners often append carriage returns (\r), newlines (\n), or whitespace
    const cleanBarcode = (barcode || '').replace(/[\r\n\t]/g, '').trim().toUpperCase();

    let { data, error } = await supabase
      .from('products')
      .select('*')
      .ilike('barcode', cleanBarcode)
      .eq('branch_id', branch_id)
      .eq('is_active', true)
      .maybeSingle();

    // Fallback: try exact match if ilike didn't hit
    if (!data && !error) {
      const res = await supabase
        .from('products')
        .select('*')
        .eq('barcode', cleanBarcode)
        .eq('branch_id', branch_id)
        .eq('is_active', true)
        .maybeSingle();
      data = res.data;
      error = res.error;
    }

    if (error || !data) throw new Error("Product not found or out of stock");
    if (data.quantity <= 0) throw new Error(`Product Out of Stock! (Available: 0)`);
    return data;
  }

  async generateBill(billData, items) {
    // 1. Insert Bill
    const { data: newBill, error: billError } = await supabase
      .from('bills')
      .insert([{
        branch_id: billData.branch_id,
        total_amount: billData.total_amount,
        payment_method: billData.payment_method,
        split_cash: billData.split_cash || 0,
        split_upi: billData.split_upi || 0,
        customer_name: billData.customer_name || 'Walk-in Customer',
        customer_phone: billData.customer_phone || null
      }])
      .select()
      .single();

    if (billError) throw billError;

    // 2. Insert Bill Items & Update Stock
    for (const item of items) {
      const { error: itemError } = await supabase
        .from('bill_items')
        .insert([{
          bill_id: newBill.id,
          product_id: item.product_id,
          quantity: item.quantity,
          price_at_sale: item.price
        }]);
      if (itemError) throw itemError;

      // Update stock
      const { data: prod } = await supabase.from('products').select('quantity').eq('id', item.product_id).single();
      await supabase.from('products').update({ quantity: prod.quantity - item.quantity }).eq('id', item.product_id);
    }

    this.cache = {}; // invalidate cache on sale
    return newBill;
  }

  async getDashboardStats(branch_id) {
    const today = new Date().toISOString().split('T')[0];

    // Fetch Products
    const { data: products } = await supabase
      .from('products')
      .select('quantity')
      .eq('branch_id', branch_id)
      .eq('is_active', true);

    const totalStock = products ? products.reduce((sum, p) => sum + p.quantity, 0) : 0;
    const lowStockCount = products ? products.filter(p => p.quantity < 5).length : 0;

    // Fetch Bills for today
    const { data: todayBills } = await supabase
      .from('bills')
      .select('total_amount, created_at')
      .eq('branch_id', branch_id)
      .gte('created_at', `${today}T00:00:00Z`);

    const todaySalesCount = todayBills ? todayBills.length : 0;
    const todayRevenue = todayBills ? todayBills.reduce((sum, b) => sum + Number(b.total_amount), 0) : 0;

    // Fetch Branches count
    const { count: totalBranches } = await supabase
      .from('branches')
      .select('*', { count: 'exact', head: true });

    // Recent Transactions
    const { data: recentTransactions } = await supabase
      .from('bills')
      .select('*')
      .eq('branch_id', branch_id)
      .order('created_at', { ascending: false })
      .limit(5);

    return {
      totalStock,
      todaySalesCount,
      todayRevenue,
      totalBranches: totalBranches || 1,
      lowStockAlerts: lowStockCount,
      recentTransactions: recentTransactions || []
    };
  }

  async getBranchesWithStats() {
    const { data: branches, error: bErr } = await supabase.from('branches').select('*');
    if (bErr) throw bErr;

    const branchesWithStats = await Promise.all(branches.map(async (branch) => {
      const { data: prods } = await supabase.from('products').select('quantity').eq('branch_id', branch.id);
      const stockItems = prods ? prods.reduce((sum, p) => sum + p.quantity, 0) : 0;

      const { data: bills } = await supabase.from('bills').select('total_amount').eq('branch_id', branch.id);
      const totalBills = bills ? bills.length : 0;
      const totalRevenue = bills ? bills.reduce((sum, b) => sum + Number(b.total_amount), 0) : 0;

      // Find an admin user for this branch
      const { data: admins } = await supabase.from('users').select('email').eq('branch_id', branch.id).limit(1);
      const adminEmail = admins && admins.length > 0 ? admins[0].email : 'Admin';

      return {
        ...branch,
        admin: adminEmail,
        stockItems,
        totalBills,
        totalRevenue
      };
    }));

    return branchesWithStats;
  }

  async addBranch(branchData) {
    // 1. Insert into branches table
    const { data: newBranch, error: branchError } = await supabase
      .from('branches')
      .insert([{
        name: branchData.name,
        address: branchData.address || '',
        phone: branchData.phone || ''
      }])
      .select()
      .single();

    if (branchError) throw branchError;

    // 2. Register user in Supabase Auth using a temporary client without persisting session
    const tempClient = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: authData } = await tempClient.auth.signUp({
      email: branchData.email,
      password: branchData.password
    });

    const userId = authData?.user?.id || crypto.randomUUID();
    const hashedPassword = await hashPassword(branchData.password);

    // 3. Save branch user login credentials linked to this branch_id
    const { error: userError } = await supabase
      .from('users')
      .insert([{
        id: userId,
        username: branchData.name,
        email: branchData.email,
        password: hashedPassword,
        branch_id: newBranch.id,
        role: 'admin'
      }]);

    if (userError) throw userError;

    return newBranch;
  }

  async getCustomerBills(branch_id) {
    const { data, error } = await supabase
      .from('bills')
      .select('*, bill_items(*, products(*))')
      .eq('branch_id', branch_id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return data || [];
  }

  async getBranchReturns(branch_id) {
    const { data, error } = await supabase
      .from('returns_exchanges')
      .select('*')
      .eq('branch_id', branch_id)
      .order('created_at', { ascending: false });
    if (error || !data) return [];

    const exIds = [...new Set(data.map(r => r.exchanged_product_id).filter(Boolean))];
    if (exIds.length > 0) {
      const { data: prods } = await supabase.from('products').select('*').in('id', exIds);
      if (prods) {
        const prodMap = {};
        prods.forEach(p => prodMap[p.id] = p);
        data.forEach(r => {
          if (r.exchanged_product_id) r.exchanged_product = prodMap[r.exchanged_product_id];
        });
      }
    }
    return data;
  }

  async deleteBill(bill_id) {
    if (!bill_id) return false;
    // 1. First find and reverse any returns/exchanges linked to this bill
    const { data: rets } = await supabase.from('returns_exchanges').select('id').eq('original_bill_id', bill_id);
    if (rets && rets.length > 0) {
      for (const r of rets) {
        await this.deleteReturn(r.id);
      }
    }

    // 2. Find all bill items and restore stock to inventory
    const { data: bItems } = await supabase.from('bill_items').select('*').eq('bill_id', bill_id);
    if (bItems && bItems.length > 0) {
      for (const bi of bItems) {
        if (bi.product_id) {
          const { data: prod } = await supabase.from('products').select('quantity').eq('id', bi.product_id).maybeSingle();
          if (prod) {
            await supabase.from('products').update({ quantity: Number(prod.quantity) + Number(bi.quantity) }).eq('id', bi.product_id);
          }
        }
      }
    }

    // 3. Delete bill items and bill record
    await supabase.from('bill_items').delete().eq('bill_id', bill_id);
    const { error } = await supabase.from('bills').delete().eq('id', bill_id);
    if (error) throw error;
    this.cache = {}; // invalidate cache
    return true;
  }

  async deleteReturn(return_id) {
    if (!return_id) return false;
    // 1. Fetch return record to reverse stock changes
    const { data: ret } = await supabase.from('returns_exchanges').select('*').eq('id', return_id).maybeSingle();
    if (ret) {
      // Reverse returned item stock (we added stock during return, so subtract it back)
      if (ret.returned_product_id && ret.return_reason !== 'Defective / Damaged') {
        const { data: retProd } = await supabase.from('products').select('quantity').eq('id', ret.returned_product_id).maybeSingle();
        if (retProd) {
          await supabase.from('products').update({ quantity: Math.max(0, Number(retProd.quantity) - Number(ret.returned_qty)) }).eq('id', ret.returned_product_id);
        }
      }
      // Reverse exchanged item stock (we subtracted stock when issuing replacement, so add it back)
      if (ret.exchanged_product_id) {
        const { data: exProd } = await supabase.from('products').select('quantity').eq('id', ret.exchanged_product_id).maybeSingle();
        if (exProd) {
          await supabase.from('products').update({ quantity: Number(exProd.quantity) + Number(ret.exchanged_qty) }).eq('id', ret.exchanged_product_id);
        }
      }
    }

    // 2. Delete return record
    const { error } = await supabase.from('returns_exchanges').delete().eq('id', return_id);
    if (error) throw error;
    this.cache = {}; // invalidate cache
    return true;
  }

  async processExchange(exchangeData) {
    // 1. Insert into returns_exchanges
    const { data: exRecord, error: exErr } = await supabase
      .from('returns_exchanges')
      .insert([exchangeData])
      .select()
      .single();
    if (exErr) throw exErr;

    // 2. Adjust Stock for Returned Item
    if (exchangeData.returned_product_id && exchangeData.return_reason !== 'Defective / Damaged') {
      const { data: retProd } = await supabase.from('products').select('quantity').eq('id', exchangeData.returned_product_id).single();
      if (retProd) {
        await supabase.from('products').update({ quantity: retProd.quantity + exchangeData.returned_qty }).eq('id', exchangeData.returned_product_id);
      }
    }

    // 3. Adjust Stock for New Exchanged Item
    if (exchangeData.exchanged_product_id) {
      const { data: exProd } = await supabase.from('products').select('quantity').eq('id', exchangeData.exchanged_product_id).single();
      if (exProd) {
        await supabase.from('products').update({ quantity: exProd.quantity - exchangeData.exchanged_qty }).eq('id', exchangeData.exchanged_product_id);
      }
    }

    // 4. Record Store Credit if net_amount < 0
    if (exchangeData.net_amount < 0 && exchangeData.customer_phone) {
      const creditAmt = Math.abs(exchangeData.net_amount);
      const { data: existCredit } = await supabase
        .from('customer_credits')
        .select('*')
        .eq('branch_id', exchangeData.branch_id)
        .eq('customer_phone', exchangeData.customer_phone)
        .maybeSingle();

      if (existCredit) {
        await supabase
          .from('customer_credits')
          .update({ balance: Number(existCredit.balance) + creditAmt, updated_at: new Date().toISOString() })
          .eq('id', existCredit.id);
      } else {
        await supabase
          .from('customer_credits')
          .insert([{ branch_id: exchangeData.branch_id, customer_phone: exchangeData.customer_phone, customer_name: exchangeData.customer_name, balance: creditAmt }]);
      }

      const { data: br } = await supabase.from('branches').select('customer_credits_balance').eq('id', exchangeData.branch_id).maybeSingle();
      if (br) {
        await supabase
          .from('branches')
          .update({ customer_credits_balance: Number(br.customer_credits_balance || 0) + creditAmt })
          .eq('id', exchangeData.branch_id);
      }
    }

    this.cache = {}; // invalidate cache
    return exRecord;
  }

  async getCustomerCredit(phone, branch_id) {
    if (!phone) return 0;
    const { data } = await supabase
      .from('customer_credits')
      .select('balance')
      .eq('branch_id', branch_id)
      .eq('customer_phone', phone)
      .maybeSingle();
    return data ? Number(data.balance) : 0;
  }

  async deductCustomerCredit(phone, branch_id, amount) {
    if (!phone || amount <= 0) return;
    const { data: existCredit } = await supabase
      .from('customer_credits')
      .select('*')
      .eq('branch_id', branch_id)
      .eq('customer_phone', phone)
      .maybeSingle();

    if (existCredit) {
      const newBal = Math.max(0, Number(existCredit.balance) - amount);
      await supabase
        .from('customer_credits')
        .update({ balance: newBal, updated_at: new Date().toISOString() })
        .eq('id', existCredit.id);

      const { data: br } = await supabase.from('branches').select('customer_credits_balance').eq('id', branch_id).maybeSingle();
      if (br) {
        const newBranchBal = Math.max(0, Number(br.customer_credits_balance || 0) - amount);
        await supabase.from('branches').update({ customer_credits_balance: newBranchBal }).eq('id', branch_id);
      }
    }
  }

  async getCategories() {
    const defaultCategories = ['T-Shirt', 'Frock', 'Pant', 'Shirt', 'Jacket', 'Shorts', 'Dress', 'Top', 'Leggings', 'Dungaree', 'Night Suit'];
    try {
      const { data, error } = await supabase.from('categories').select('*').order('name');
      if (error || !data || data.length === 0) {
        return defaultCategories.map((c, i) => ({ id: `def-${i}`, name: c }));
      }
      return data;
    } catch (e) {
      return defaultCategories.map((c, i) => ({ id: `def-${i}`, name: c }));
    }
  }

  async addCategory(name) {
    const { data, error } = await supabase.from('categories').insert([{ name: name.trim() }]).select().single();
    if (error) throw error;
    return data;
  }

  async deleteCategory(id) {
    if (String(id).startsWith('def-')) throw new Error("Please run the database upgrade query in Supabase first.");
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
  }

  async getSizes() {
    const defaultSizes = ['80', '90', '100', '110', '120', '130', '140', '150', '160', '170'];
    try {
      const { data, error } = await supabase.from('sizes').select('*').order('name');
      if (error || !data || data.length === 0) {
        return defaultSizes.map((s, i) => ({ id: `def-${i}`, name: s }));
      }
      return data;
    } catch (e) {
      return defaultSizes.map((s, i) => ({ id: `def-${i}`, name: s }));
    }
  }

  async addSize(name) {
    const { data, error } = await supabase.from('sizes').insert([{ name: name.trim() }]).select().single();
    if (error) throw error;
    return data;
  }

  async deleteSize(id) {
    if (String(id).startsWith('def-')) throw new Error("Please run the database upgrade query in Supabase first.");
    const { error } = await supabase.from('sizes').delete().eq('id', id);
    if (error) throw error;
  }

  async getExpenses(branch_id = null) {
    try {
      let query = supabase.from('shop_expenses').select('*').order('expense_date', { ascending: false }).order('created_at', { ascending: false });
      if (branch_id && branch_id !== 'all') {
        query = query.eq('branch_id', branch_id);
      }
      const { data, error } = await query;
      if (error) {
        console.warn("Error fetching shop_expenses (table might need creation in Supabase):", error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn("Exception in getExpenses:", err);
      return [];
    }
  }

  async addExpense(expenseData) {
    const { data, error } = await supabase
      .from('shop_expenses')
      .insert([{
        branch_id: expenseData.branch_id,
        amount: parseFloat(expenseData.amount),
        category: expenseData.category || 'Other',
        description: expenseData.description,
        payment_method: expenseData.payment_method || 'Cash',
        expense_date: expenseData.expense_date || new Date().toISOString().split('T')[0]
      }])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteExpense(id) {
    const { error } = await supabase.from('shop_expenses').delete().eq('id', id);
    if (error) throw error;
  }
}

export const db = new SupabaseDB();
