import { supabase } from './supabaseClient';

class SupabaseDB {
  async login(email, password) {
    // 1. Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (authError) throw new Error("Invalid email or password");

    // 2. Fetch user profile and branch details
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*, branches(*)')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) throw new Error("User profile not found in database.");

    return { ...profile, branch: profile.branches };
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
    return true;
  }

  async getProducts(branch_id) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('branch_id', branch_id)
      .eq('is_active', true);
    if (error) throw error;
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
        payment_method: billData.payment_method
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
}

export const db = new SupabaseDB();
