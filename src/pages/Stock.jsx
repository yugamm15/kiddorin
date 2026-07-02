import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const DEFAULT_CATEGORIES = ['T-Shirt', 'Frock', 'Pant', 'Shirt', 'Jacket', 'Shorts', 'Dress', 'Top', 'Leggings', 'Dungaree', 'Night Suit'];
const DEFAULT_SIZES = ['80', '90', '100', '110', '120', '130', '140', '150', '160', '170'];

const Stock = () => {
  const { user } = useAuth();
  const [success, setSuccess] = useState(false);
  const [dealers, setDealers] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [sizes, setSizes] = useState(DEFAULT_SIZES);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  
  const [formData, setFormData] = useState({
    category: '',
    gender: '',
    design_number: '',
    quantity: '',
    purchase_price: '',
    selling_price: '',
    branch: user?.branch?.name || 'Main Store',
    dealer_id: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [selectedColors, setSelectedColors] = useState([]);
  const [colorInput, setColorInput] = useState('');
  const [selectedSizes, setSelectedSizes] = useState([]);

  useEffect(() => {
    db.getDealers().then(setDealers);
    db.getCategories().then(data => setCategories(data.map(c => c.name)));
    db.getSizes().then(data => setSizes(data.map(s => s.name)));
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id.replace('s-', '')]: e.target.value });
  };

  const handleAddColor = () => {
    const col = colorInput.trim().toUpperCase();
    if (col && !selectedColors.includes(col)) {
      setSelectedColors([...selectedColors, col]);
      setColorInput('');
    }
  };

  const removeColor = (col) => {
    setSelectedColors(selectedColors.filter(c => c !== col));
  };

  const toggleSize = (size) => {
    if (selectedSizes.includes(size)) {
      setSelectedSizes(selectedSizes.filter(s => s !== size));
    } else {
      setSelectedSizes([...selectedSizes, size]);
    }
  };

  const downloadTemplate = () => {
    const defaultDate = new Date().toISOString().split('T')[0];
    const defaultBranch = user?.branch?.name || 'Main Store';
    const firstDealer = dealers.length > 0 ? dealers[0].name : 'Fashion Traders';
    
    const wsData = [
      ["Category", "Gender", "Design Number", "Color", "Size", "Quantity", "Purchase Price", "Selling Price", "Dealer Name", "Branch Name", "Date"],
      ["T-Shirt", "Boy", "D-2001", "RED", "100", 10, 250, 450, firstDealer, defaultBranch, defaultDate],
      ["Frock", "Girl", "D-2002", "PINK", "110", 5, 350, 650, firstDealer, defaultBranch, defaultDate]
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Bulk Stock Template");
    XLSX.writeFile(wb, "kiddorin_bulk_stock_template.xlsx");
  };

  const processFile = async (file) => {
    if (!file) return;

    if (!file.name.match(/\.(csv|xlsx|xls)$/i)) {
      toast.error('Please upload an Excel (.xlsx, .xls) or .csv file. Use the Download Template button!');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet);

        if (!rows || rows.length === 0) {
          toast.error('Spreadsheet is empty or missing data rows.');
          return;
        }

        const toastId = toast.loading('Processing bulk stock spreadsheet... Please wait ⏳');
        let successCount = 0;
        let skipCount = 0;
        const designsAddedInThisBatch = new Set();

        for (const row of rows) {
          // Normalize column keys (lowercase and trimmed)
          const cleanRow = {};
          Object.keys(row).forEach(k => {
            cleanRow[k.trim().toLowerCase()] = row[k];
          });

          const design_number = String(cleanRow['design number'] || cleanRow['design_number'] || cleanRow['design'] || '').trim();
          const quantity = parseInt(cleanRow['quantity'] || cleanRow['qty']) || 1;
          const purchase_price = parseFloat(cleanRow['purchase price'] || cleanRow['purchase_price'] || cleanRow['cost']) || 0;
          const selling_price = parseFloat(cleanRow['selling price'] || cleanRow['selling_price'] || cleanRow['price']) || 0;

          if (!design_number) continue;

          const designKey = design_number.toUpperCase();
          if (!designsAddedInThisBatch.has(designKey)) {
            const exists = await db.checkDesignExists(design_number, user.branch_id);
            if (exists) {
              skipCount++;
              continue;
            }
            designsAddedInThisBatch.add(designKey);
          }

          // Dealer lookup
          let dealer_id = formData.dealer_id || null;
          const dealerName = String(cleanRow['dealer name'] || cleanRow['dealer'] || '').trim();
          if (dealerName) {
            const matchedDealer = dealers.find(d => d.name.toLowerCase() === dealerName.toLowerCase());
            if (matchedDealer) dealer_id = matchedDealer.id;
          }

          // Date lookup (default to today if empty)
          let dateStr = new Date().toISOString().split('T')[0];
          const rawDate = cleanRow['date'];
          if (rawDate) {
            if (typeof rawDate === 'number') {
              // Excel date serial number
              const excelDate = new Date((rawDate - (25567 + 2)) * 86400 * 1000);
              if (!isNaN(excelDate.getTime())) {
                dateStr = excelDate.toISOString().split('T')[0];
              }
            } else if (typeof rawDate === 'string' && rawDate.trim()) {
              dateStr = rawDate.trim();
            }
          }

          try {
            await db.addStock({
              category: String(cleanRow['category'] || 'General').trim(),
              gender: String(cleanRow['gender'] || 'Unisex').trim(),
              design_number,
              color: String(cleanRow['color'] || 'MULTI').trim(),
              size: String(cleanRow['size'] || 'FREE').trim(),
              quantity,
              purchase_price,
              selling_price,
              dealer_id,
              branch_id: user.branch_id,
              date: dateStr
            });
            successCount++;
          } catch (err) {
            console.error('Row error:', err);
          }
        }

        if (successCount > 0) {
          toast.success(`Bulk upload completed! Successfully added ${successCount} items.`, { id: toastId });
          if (skipCount > 0) {
            toast.error(`Skipped ${skipCount} items because their Design Numbers already exist in your branch.`);
          }
        } else if (skipCount > 0) {
          toast.error(`All ${skipCount} items were skipped because their Design Numbers already exist in your store branch! Use Restock in Inventory.`, { id: toastId });
        } else {
          toast.error('Failed to process rows. Check spreadsheet columns.', { id: toastId });
        }
      } catch (err) {
        toast.error('Error reading file. Please upload a valid Excel or CSV.');
        console.error(err);
      }
      if (fileInputRef.current) fileInputRef.current.value = null;
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleAddStock = async () => {
    if (!formData.category || !formData.gender || !formData.design_number || !formData.quantity || !formData.purchase_price || !formData.selling_price || !formData.dealer_id || !formData.date) {
      toast.error('Please fill all basic required fields.');
      return;
    }
    if (selectedColors.length === 0) {
      toast.error('Please add at least one color.');
      return;
    }
    if (selectedSizes.length === 0) {
      toast.error('Please select at least one size.');
      return;
    }

    // Check if duplicate design number exists in this branch
    const exists = await db.checkDesignExists(formData.design_number, user.branch_id);
    if (exists) {
      toast.error(`Design Number "${formData.design_number}" already exists in your store branch! To increase stock for existing items, please use RESTOCK on the Inventory page.`);
      return;
    }

    const toastId = toast.loading('Adding items to stock... Please wait ⏳');
    try {
      // Create permutations of color and size
      for (const color of selectedColors) {
        for (const size of selectedSizes) {
          await db.addStock({
            ...formData,
            color,
            size,
            branch_id: user.branch_id
          });
        }
      }
      
      toast.success('Stock added successfully!', { id: toastId });
      handleClear();
    } catch (error) {
      toast.error("Error adding stock: " + error.message, { id: toastId });
    }
  };

  const handleClear = () => {
    setFormData(prev => ({
      ...prev,
      category: '',
      gender: '',
      design_number: '',
      quantity: '',
      purchase_price: '',
      selling_price: '',
      dealer_id: '',
      date: new Date().toISOString().split('T')[0]
    }));
    setSelectedColors([]);
    setSelectedSizes([]);
  };

  return (
    <div className="page active" id="stock-page">
      <div className="page-title">Stock Insertion</div>
      <div className="page-sub">Add brand new stock purchased from dealer</div>
      
      {success && (
        <div className="alert alert-success" id="stock-success" style={{ display: 'block' }}>
          ✓ Stock added successfully!
        </div>
      )}

      {/* Bulk Upload Section */}
      <div className="card" style={{ marginBottom: '24px', background: 'var(--white)', border: '1px solid var(--border)' }}>
        <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>🚀 Bulk Stock Insertion (CSV / Excel)</span>
          <button className="btn btn-secondary" onClick={downloadTemplate} style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '20px' }}>
            ⬇ Download Template (.xlsx)
          </button>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Upload a completed Excel (.xlsx/.xls) or CSV template file to add multiple new products at once. Existing branch design numbers will be automatically skipped!
        </p>
        
        {/* Drag and Drop Zone */}
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${isDragging ? 'var(--primary)' : '#cbd5e1'}`,
            borderRadius: '12px',
            padding: '36px 20px',
            textAlign: 'center',
            background: isDragging ? 'rgba(99, 102, 241, 0.05)' : '#f8fafc',
            cursor: 'pointer',
            transition: 'all 0.2s ease-in-out',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px'
          }}
        >
          <input 
            type="file" 
            ref={fileInputRef}
            accept=".csv,.xlsx,.xls" 
            onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
            style={{ display: 'none' }}
          />
          <div style={{ fontSize: '36px' }}>📂</div>
          <div>
            <span style={{ fontWeight: '600', color: 'var(--primary)', fontSize: '15px' }}>Click to browse</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '15px' }}> or drag and drop your Excel / CSV file here</span>
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', background: '#e2e8f0', padding: '4px 10px', borderRadius: '12px' }}>
            Supports Excel (.XLSX, .XLS) & .CSV format
          </div>
        </div>
      </div>
      
      <div className="card">
        <div className="section-title">Product Details (Single Insertion)</div>
        <div className="form-grid">
          
          <div className="form-group">
            <label>Category</label>
            <select id="s-category" value={formData.category} onChange={handleChange}>
              <option value="">Select category</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          
          <div className="form-group">
            <label>Gender</label>
            <select id="s-gender" value={formData.gender} onChange={handleChange}>
              <option value="">Select gender</option>
              <option value="Boy">Boy</option>
              <option value="Girl">Girl</option>
              <option value="Unisex">Unisex</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Design Number</label>
            <input type="text" id="s-design_number" placeholder="e.g. D-1001" value={formData.design_number} onChange={handleChange} />
          </div>

          <div className="form-group full">
            <label>Sizes (Select Multiple)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
              {sizes.map(s => (
                <div 
                  key={s} 
                  onClick={() => toggleSize(s)}
                  style={{ 
                    padding: '10px 16px', 
                    border: `1px solid ${selectedSizes.includes(s) ? 'var(--dark)' : 'var(--border)'}`, 
                    borderRadius: 'var(--radius)', 
                    cursor: 'pointer',
                    background: selectedSizes.includes(s) ? 'var(--dark)' : 'var(--white)',
                    color: selectedSizes.includes(s) ? 'var(--white)' : 'var(--dark)',
                    fontWeight: 600,
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    transition: 'all 0.3s'
                  }}
                >
                  {s}
                </div>
              ))}
            </div>
          </div>

          <div className="form-group full">
            <label>Colors (Add Multiple)</label>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '4px' }}>
              <input 
                type="text" 
                placeholder="Type color (e.g. NAVY BLUE) and press Add"
                value={colorInput} 
                onChange={e => setColorInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' ? handleAddColor() : null}
                style={{ flex: 1 }} 
              />
              <button className="btn btn-secondary" onClick={handleAddColor} style={{ whiteSpace: 'nowrap' }}>+ Add Color</button>
            </div>
            {selectedColors.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '16px' }}>
                {selectedColors.map(c => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--white)', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                    <span style={{ fontSize: '11px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, letterSpacing: '1px' }}>{c}</span>
                    <span onClick={() => removeColor(c)} style={{ cursor: 'pointer', color: 'var(--danger)', fontSize: '14px', marginLeft: '8px', fontWeight: 'bold' }}>✕</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Quantity per variation</label>
            <input type="number" id="s-quantity" placeholder="e.g. 10" min="1" value={formData.quantity} onChange={handleChange} />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>This qty applies to EACH selected size & color</span>
          </div>
          
          <div className="form-group">
            <label>Purchase Price (₹)</label>
            <input type="number" id="s-purchase_price" placeholder="e.g. 250" min="0" value={formData.purchase_price} onChange={handleChange} />
          </div>
          
          <div className="form-group">
            <label>Selling Price (₹)</label>
            <input type="number" id="s-selling_price" placeholder="e.g. 450" min="0" value={formData.selling_price} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label>Branch</label>
            <select id="s-branch" value={formData.branch} onChange={handleChange} disabled>
              <option value={user?.branch?.name}>{user?.branch?.name}</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Dealer</label>
            <select id="s-dealer_id" value={formData.dealer_id} onChange={handleChange}>
              <option value="">Select a dealer...</option>
              {dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          
          <div className="form-group">
            <label>Date of Purchase</label>
            <input type="date" id="s-date" value={formData.date} onChange={handleChange} />
          </div>
          
        </div>
        
        <div className="btn-row">
          <button className="btn btn-primary" onClick={handleAddStock}>Add to Stock</button>
          <button className="btn btn-secondary" onClick={handleClear}>Clear</button>
        </div>
      </div>
    </div>
  );
};

export default Stock;
