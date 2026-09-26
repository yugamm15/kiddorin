import React from 'react';
import { usePricePrivacy } from '../context/PricePrivacyContext';

/**
 * MaskedPrice Component
 * Displays the price if unlocked; otherwise renders a sleek clickable masked lock badge.
 */
const MaskedPrice = ({
  value,
  prefix = '₹',
  suffix = '',
  formatter,
  maskedText = '••••••',
  className = '',
  style = {}
}) => {
  const { isPriceUnlocked, openUnlockModal } = usePricePrivacy();

  if (isPriceUnlocked) {
    let displayValue = value;
    if (typeof formatter === 'function') {
      displayValue = formatter(value);
    } else if (typeof value === 'number') {
      displayValue = value.toLocaleString('en-IN');
    }
    return (
      <span className={className} style={style}>
        {prefix}{displayValue}{suffix}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`price-masked-badge ${className}`}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        openUnlockModal();
      }}
      title="🔒 Buying price is hidden. Click to enter PIN and reveal."
    >
      <span className="price-masked-icon">🔒</span>
      <span className="price-masked-dots">{maskedText}</span>
    </button>
  );
};

export default MaskedPrice;
