import React, { useState, useEffect, useRef } from 'react';
import { usePricePrivacy } from '../context/PricePrivacyContext';

const UnlockPriceModal = () => {
  const { isUnlockModalOpen, closeUnlockModal, unlockPrices } = usePricePrivacy();
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isUnlockModalOpen) {
      setPin('');
      setShowPin(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isUnlockModalOpen]);

  if (!isUnlockModalOpen) return null;

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!pin.trim()) return;

    setSubmitting(true);
    const res = await unlockPrices(pin);
    setSubmitting(false);
    if (res.success) {
      setPin('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      closeUnlockModal();
    }
  };

  return (
    <div 
      className="unlock-modal-overlay" 
      onClick={closeUnlockModal}
      onKeyDown={handleKeyDown}
    >
      <div 
        className="unlock-modal-card" 
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          className="unlock-modal-close" 
          onClick={closeUnlockModal}
          type="button"
          aria-label="Close"
        >
          ✕
        </button>

        <div className="unlock-icon-wrap">
          <div className="unlock-icon-circle">
            🔒
          </div>
        </div>

        <h2 className="unlock-modal-title">Shopkeeper Security PIN</h2>
        <p className="unlock-modal-subtitle">
          Buying prices and business profit margins are protected. Enter your security PIN to unlock and view real cost prices.
        </p>

        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <div className="unlock-input-container">
            <input
              ref={inputRef}
              type={showPin ? 'text' : 'password'}
              className="unlock-pin-input"
              placeholder="Enter Security PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              maxLength={20}
              autoComplete="off"
            />
            <button
              type="button"
              className="unlock-show-toggle"
              onClick={() => setShowPin(!showPin)}
              tabIndex="-1"
              title={showPin ? 'Hide PIN' : 'Show PIN'}
            >
              {showPin ? '👁️' : '🔒'}
            </button>
          </div>

          <div className="unlock-hint">
            💡 Buying price & margin privacy is protected with cryptographic security. You can change your PIN anytime under <strong>Settings</strong>.
          </div>

          <div className="unlock-btn-row">
            <button 
              type="button" 
              className="btn btn-secondary unlock-cancel-btn" 
              onClick={closeUnlockModal}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary unlock-submit-btn"
              disabled={submitting || !pin.trim()}
            >
              {submitting ? 'Verifying...' : '🔓 Reveal Buying Prices'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UnlockPriceModal;
