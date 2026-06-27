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
    const barcode = `${productData.design_number}-${productData.size}-${productData.color}`.replace(/\s+/g, '').toUpperCase();
    
    // Check if product exists
    const { data: existing } = await supabase
      .from('products')
      .select('*')
      .eq('barcode', barcode)
      .eq('branch_id', productData.branch_id)
      .single();

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
      // Insert new product
      const { data, error } = await supabase
        .from('products')
        .insert([{
          category: productData.category,
          gender: productData.gender,
          color: productData.color,
          size: productData.size,
          design_number: productData.design_number,
          barcode: barcode,
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

  async getProducts(branch_id, forceRefresh = false) {
    if (!forceRefresh && this.cache[`products_${branch_id}`] && (Date.now() - this.cache[`products_${branch_id}`].ts < 60000)) {
      return this.cache[`products_${branch_id}`].data;
    }
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('branch_id', branch_id)
      .eq('is_active', true);
    if (error) throw error;
    this.cache[`products_${branch_id}`] = { data, ts: Date.now() };
    return data;
  }

  async getProductByBarcode(barcode, branch_id) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('barcode', barcode)
      .eq('branch_id', branch_id)
      .eq('is_active', true)
      .single();
      
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
    if (error) return [];
    return data || [];
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
}

export const db = new SupabaseDB();
