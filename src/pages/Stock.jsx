import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';
import toast from 'react-hot-toast';

const CATEGORIES = ['T-Shirt', 'Frock', 'Pant', 'Shirt', 'Jacket', 'Shorts', 'Dress', 'Top', 'Leggings', 'Dungaree', 'Night Suit'];
const SIZES = ['80', '90', '100', '110', '120', '130', '140', '150', '160', '170'];

const Stock = () => {
  const { user } = useAuth();
  const [success, setSuccess] = useState(false);
  const [dealers, setDealers] = useState([]);
  
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
      
      toast.success('Stock added successfully!');
      handleClear();
    } catch (error) {
      toast.error("Error adding stock: " + error.message);
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
      <div className="page-sub">Add new stock purchased from dealer</div>
      
      {success && (
        <div className="alert alert-success" id="stock-success" style={{ display: 'block' }}>
          ✓ Stock added successfully!
        </div>
      )}
      
      <div className="card">
        <div className="section-title">Product Details</div>
        <div className="form-grid">
          
          <div className="form-group">
            <label>Category</label>
            <select id="s-category" value={formData.category} onChange={handleChange}>
              <option value="">Select category</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          
          <div className="form-group">
            <label>Gender</label>
            <select id="s-gender" value={formData.gender} onChange={handleChange}>
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
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
              {SIZES.map(s => (
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
