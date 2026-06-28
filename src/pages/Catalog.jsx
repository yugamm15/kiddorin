import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import toast from 'react-hot-toast';

const Catalog = () => {
  const [categories, setCategories] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [newCat, setNewCat] = useState('');
  const [newSize, setNewSize] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const cats = await db.getCategories();
      const szs = await db.getSizes();
      setCategories(cats || []);
      setSizes(szs || []);
    } catch (e) {
      toast.error('Failed to load catalog items: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddCategory = async () => {
    if (!newCat.trim()) return;
    try {
      await db.addCategory(newCat.trim());
      toast.success('Category added successfully!');
      setNewCat('');
      loadData();
    } catch (e) {
      toast.error('Error adding category: ' + e.message);
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('Are you sure you want to delete this category?')) return;
    try {
      await db.deleteCategory(id);
      toast.success('Category removed.');
      loadData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleAddSize = async () => {
    if (!newSize.trim()) return;
    try {
      await db.addSize(newSize.trim());
      toast.success('Size added successfully!');
      setNewSize('');
      loadData();
    } catch (e) {
      toast.error('Error adding size: ' + e.message);
    }
  };

  const handleDeleteSize = async (id) => {
    if (!window.confirm('Are you sure you want to delete this size?')) return;
    try {
      await db.deleteSize(id);
      toast.success('Size removed.');
      loadData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="page active">
      <div className="page-title">Super Admin Catalog</div>
      <div className="page-sub">Manage available Product Categories and Sizes across all branches</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '20px' }}>
        {/* Categories Card */}
        <div className="card">
          <div className="section-title">📂 Product Categories</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input 
              type="text" 
              placeholder="New Category Name (e.g. Romper)" 
              value={newCat} 
              onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => e.key === 'Enter' ? handleAddCategory() : null}
              style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}
            />
            <button className="btn btn-primary" onClick={handleAddCategory}>+ Add</button>
          </div>

          <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {categories.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--off-white)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 600, fontSize: '13px' }}>{c.name}</span>
                <button 
                  onClick={() => handleDeleteCategory(c.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Sizes Card */}
        <div className="card">
          <div className="section-title">📏 Product Sizes</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input 
              type="text" 
              placeholder="New Size (e.g. 180 or S/M/L)" 
              value={newSize} 
              onChange={e => setNewSize(e.target.value)}
              onKeyDown={e => e.key === 'Enter' ? handleAddSize() : null}
              style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}
            />
            <button className="btn btn-primary" onClick={handleAddSize}>+ Add</button>
          </div>

          <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {sizes.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--white)', borderRadius: '20px', border: '1px solid var(--border)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                <span style={{ fontWeight: 700, fontSize: '13px' }}>{s.name}</span>
                <button 
                  onClick={() => handleDeleteSize(s.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', marginLeft: '4px' }}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Catalog;
