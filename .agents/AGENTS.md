# Project Rules & Design Guidelines - Kiddorin

## 1. Sale Report Rules
- **Pure POS Sales Only**: The Sale Report (`sales`) must ONLY list standard POS sales bills. 
- **No Negative Return clutter**: Product return entries must not be listed as separate negative rows in the Sale Report.

## 2. Exchange & Return Report Rules
- **Customer-Wise Grouping**: The Exchange & Return Report (`exchange_report`) must always group transactions customer-wise (by Customer Phone / Customer Name).
- **Returned & Exchanged Item Details**: For each customer, display all returned items (with Category, Size, Design #, and Return Reason) and all replacement items taken in exchange.
- **Payment Modes**: For even exchanges or 0 rupees credit note balances, display the actual payment mode (Cash/UPI) from the original bill or exchange transaction.
- **Credit Note Balances**: Display active remaining Store Credit Note balances per customer.

## 3. Database & Data Resolution Standards
- **Supabase Foreign Key Joins**: Always select `exchanged_product:products!exchanged_product_id(*)` and `returned_product:products!returned_product_id(*)` when querying `returns_exchanges`.
- **Mathematical Fallback**: If an exchanged product price is missing or unlinked, reconstruct the replacement item price using `Returned Price + Net Amount`.
