import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';
import JsBarcode from 'jsbarcode';
import toast from 'react-hot-toast';

const BarcodePage = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchName, setSearchName] = useState('');
  const [searchColor, setSearchColor] = useState('');
  const [searchSize, setSearchSize] = useState('');
  const [printPaperSize, setPrintPaperSize] = useState('1.5x2');
  const printRef = useRef(null);

  useEffect(() => {
    const bId = user?.branch_id || user?.branch?.id;
    if (bId) {
      setLoading(true);
      db.getProducts(bId).then(data => {
        setProducts(data || []);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [user]);

  const filtered = products.filter(s => {
    const matchName = ((s.design_number || '') + " " + (s.category || '')).toLowerCase().includes((searchName || '').toLowerCase());
    const matchColor = (s.color || '').toLowerCase().includes((searchColor || '').toLowerCase());
    const matchSize = (s.size || '').toLowerCase().includes((searchSize || '').toLowerCase());
    return matchName && matchColor && matchSize;
  });

  useEffect(() => {
    // Generate barcodes for visible items
    filtered.forEach(s => {
      try {
        if (!s.barcode) return;
        const elem = document.getElementById(`barsvg-${s.id}`);
        if (!elem) return;
        const isSticker = printPaperSize !== 'a4';
        const barW = printPaperSize === '1.5x2' ? 1.15 : (printPaperSize === '2x1.5' ? 1.35 : 1.5);
        const barH = printPaperSize === '1.5x2' ? 42 : (printPaperSize === '2x1.5' ? 34 : 50);
        JsBarcode(elem, s.barcode, {
          format: 'CODE128', 
          width: barW, 
          height: barH, 
          displayValue: false, 
          margin: isSticker ? 2 : 4
        });
      } catch(e) {}
    });
  }, [filtered, printPaperSize]);

  const printBarcodes = () => {
    if (filtered.length === 0) {
      toast.error('No products visible to print!');
      return;
    }
    toast.dismiss();
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
          <div className="form-group" style={{ flex: '0 0 auto' }}>
            <label>Paper / Sticker Size</label>
            <select value={printPaperSize} onChange={e => setPrintPaperSize(e.target.value)} style={{ height: '42px', fontWeight: 600 }}>
              <option value="1.5x2">Thermal Roll (1.5" × 2" Vertical)</option>
              <option value="2x1.5">Thermal Roll (2" × 1.5" Horizontal)</option>
              <option value="a4">Standard A4 Sheet (Grid)</option>
            </select>
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
            {loading ? (
              [...Array(6)].map((_, i) => (
                <tr key={`skel-${i}`}>
                  <td colSpan="6" style={{ padding: '8px 16px' }}>
                    <div className="skeleton skeleton-table-row" style={{ marginBottom: 0 }}></div>
                  </td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan="6" style={{textAlign: 'center', padding: '24px', color: '#aaa'}}>No products found</td></tr>
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
      
      {/* Dynamic Print Styles for Sticker Rolls */}
      {printPaperSize !== 'a4' && (
        <style>{`
          @media print {
            @page {
              size: ${printPaperSize === '1.5x2' ? '1.5in 2in' : '2in 1.5in'};
              margin: 0;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: ${printPaperSize === '1.5x2' ? '1.5in' : '2in'} !important;
            }
            #print-bill.barcode-grid {
              display: block !important;
              margin: 0 !important;
              padding: 0 !important;
              width: ${printPaperSize === '1.5x2' ? '1.5in' : '2in'} !important;
            }
            #print-bill.barcode-grid .barcode-card {
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              justify-content: center !important;
              width: ${printPaperSize === '1.5x2' ? '1.5in' : '2in'} !important;
              height: ${printPaperSize === '1.5x2' ? '2in' : '1.5in'} !important;
              margin: 0 !important;
              padding: 4px 2px !important;
              border: none !important;
              box-shadow: none !important;
              page-break-after: always !important;
              page-break-inside: avoid !important;
              box-sizing: border-box !important;
              overflow: hidden !important;
            }
          }
        `}</style>
      )}

      {/* THIS IS HIDDEN ON SCREEN, ONLY SHOWS DURING PRINTING */}
      <div className={`barcode-grid print-mode-${printPaperSize} print-only`} ref={printRef} id="print-bill">
        {filtered.map(s => {
          const availSizes = [...new Set(products.filter(p => p.design_number === s.design_number).map(p => p.size).filter(Boolean))].join(', ');
          return (
            <div key={s.id} className="barcode-card">
              <svg id={`barsvg-${s.id}`}></svg>
              <div style={{ textAlign: 'center', marginTop: '1px', marginBottom: '2px', lineHeight: 1.05 }}>
                <div style={{ fontSize: printPaperSize === 'a4' ? '9px' : '6.5px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 0 }}>Available Size</div>
                <div style={{ fontSize: printPaperSize === 'a4' ? '11px' : '8.5px', fontWeight: 700, color: 'var(--dark)', wordBreak: 'break-word', padding: '0 2px', marginTop: 0 }}>{availSizes}</div>
              </div>
              <div className="barcode-info" style={{ fontSize: printPaperSize === 'a4' ? '11px' : '8px', lineHeight: 1.2, textAlign: 'center' }}>
                {s.category} | {s.size} | {s.color}
              </div>
              <div className="barcode-price" style={{ fontSize: printPaperSize === 'a4' ? '18px' : '13px', margin: '1px 0', lineHeight: 1.1, fontWeight: 700 }}>
                ₹{s.selling_price}
              </div>
              <div style={{ fontSize: printPaperSize === 'a4' ? '10px' : '7px', color: '#666', fontFamily: 'monospace' }}>
                {s.barcode}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BarcodePage;
