import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';
import JsBarcode from 'jsbarcode';

const BarcodePage = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [searchName, setSearchName] = useState('');
  const [searchColor, setSearchColor] = useState('');
  const [searchSize, setSearchSize] = useState('');
  const printRef = useRef(null);

  useEffect(() => {
    if (user?.branch_id) {
      db.getProducts(user.branch_id).then(setProducts);
    }
  }, [user]);

  const filtered = products.filter(s => {
    const matchName = (s.design_number + " " + s.category).toLowerCase().includes(searchName.toLowerCase());
    const matchColor = s.color.toLowerCase().includes(searchColor.toLowerCase());
    const matchSize = s.size.toLowerCase().includes(searchSize.toLowerCase());
    return matchName && matchColor && matchSize;
  });

  useEffect(() => {
    // Generate barcodes for visible items
    filtered.forEach(s => {
      try {
        JsBarcode(`#barsvg-${s.id}`, s.barcode, {
          format: 'CODE128', 
          width: 1.5, 
          height: 50, 
          displayValue: false, 
          margin: 4
        });
      } catch(e) {}
    });
  }, [filtered]);

  const printBarcodes = () => {
    window.print();
  };

  return (
    <div className="page active" id="barcode-page">
      <div className="page-title">Barcode Generator</div>
      <div className="page-sub">Generate and print barcodes for products</div>
      
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label>Design Number / Name</label>
            <input 
              type="text" 
              placeholder="e.g. 101 or Shirt" 
              value={searchName}
              onChange={e => setSearchName(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ flex: '1 1 150px' }}>
            <label>Color</label>
            <input 
              type="text" 
              placeholder="e.g. BLUE" 
              value={searchColor}
              onChange={e => setSearchColor(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ flex: '1 1 150px' }}>
            <label>Size</label>
            <input 
              type="text" 
              placeholder="e.g. 80" 
              value={searchSize}
              onChange={e => setSearchSize(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={printBarcodes} style={{ height: '42px', padding: '0 24px' }}>
            🖨️ Print All Visible
          </button>
        </div>
      </div>
      
      <div className="table-responsive desktop-table">
        <table className="table">
          <thead>
            <tr>
              <th>Design No.</th>
              <th>Category</th>
              <th>Color</th>
              <th>Size</th>
              <th>Price</th>
              <th>Barcode</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan="6" style={{textAlign: 'center'}}>No products found</td></tr>
            ) : (
              filtered.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.design_number}</strong></td>
                  <td>{s.category} ({s.gender})</td>
                  <td>{s.color}</td>
                  <td>{s.size}</td>
                  <td>₹{s.selling_price}</td>
                  <td style={{fontFamily: 'monospace', color: 'var(--text-muted)'}}>{s.barcode}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* THIS IS HIDDEN ON SCREEN, ONLY SHOWS DURING PRINTING */}
      <div className="barcode-grid" ref={printRef} id="print-bill" style={{ display: 'none' }}>
        {filtered.map(s => (
          <div key={s.id} className="barcode-card">
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--dark)', marginBottom: '4px' }}>Kiddorin</div>
            <svg id={`barsvg-${s.id}`}></svg>
            <div className="barcode-info">{s.category} | {s.gender} | {s.color} | {s.size}</div>
            <div className="barcode-info">Design: {s.design_number}</div>
            <div className="barcode-price">₹{s.selling_price}</div>
            <div style={{ fontSize: '10px', color: '#aaa', marginTop: '2px' }}>{s.barcode}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BarcodePage;
