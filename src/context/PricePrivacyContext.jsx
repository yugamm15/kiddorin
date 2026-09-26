import React, { createContext, useContext, useState, useEffect } from 'react';
import { hashPin } from '../utils/security';
import toast from 'react-hot-toast';

const PricePrivacyContext = createContext();

export const usePricePrivacy = () => {
  const context = useContext(PricePrivacyContext);
  if (!context) {
    throw new Error('usePricePrivacy must be used within a PricePrivacyProvider');
  }
  return context;
};

// Cryptographic salted SHA-256 digest for default authorization (No plain-text PIN stored in source code)
const DEFAULT_AUTH_HASH = '54597eba719e5af463193f1f40fab418130bc41e6263d3a9fc53ad48d8022aae';

export const PricePrivacyProvider = ({ children }) => {
  const [isPriceUnlocked, setIsPriceUnlocked] = useState(false);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [onUnlockCallback, setOnUnlockCallback] = useState(null);

  useEffect(() => {
    // Check if previously unlocked in this session
    const unlocked = sessionStorage.getItem('kiddorin_price_unlocked');
    if (unlocked === 'true') {
      setIsPriceUnlocked(true);
    }
  }, []);

  const verifyPin = async (inputPin) => {
    const cleanPin = String(inputPin || '').trim();
    if (!cleanPin) return false;

    const inputHash = await hashPin(cleanPin);
    const storedHash = localStorage.getItem('kiddorin_cost_pin_hash');

    if (!storedHash) {
      return inputHash === DEFAULT_AUTH_HASH;
    }

    return inputHash === storedHash;
  };

  const unlockPrices = async (inputPin) => {
    const isValid = await verifyPin(inputPin);
    if (isValid) {
      setIsPriceUnlocked(true);
      sessionStorage.setItem('kiddorin_price_unlocked', 'true');
      setIsUnlockModalOpen(false);
      toast.success('🔓 Buying prices unlocked!', { id: 'price-unlock-toast' });
      if (typeof onUnlockCallback === 'function') {
        onUnlockCallback();
        setOnUnlockCallback(null);
      }
      return { success: true };
    } else {
      toast.error('❌ Incorrect PIN. Please try again.', { id: 'price-unlock-err' });
      return { success: false, error: 'Incorrect PIN' };
    }
  };

  const lockPrices = () => {
    setIsPriceUnlocked(false);
    sessionStorage.removeItem('kiddorin_price_unlocked');
    toast.success('🔒 Buying prices locked and hidden.', { id: 'price-lock-toast' });
  };

  const openUnlockModal = (callback = null) => {
    if (isPriceUnlocked) {
      if (typeof callback === 'function') callback();
      return;
    }
    if (typeof callback === 'function') {
      setOnUnlockCallback(() => callback);
    }
    setIsUnlockModalOpen(true);
  };

  const closeUnlockModal = () => {
    setIsUnlockModalOpen(false);
    setOnUnlockCallback(null);
  };

  const changePin = async (currentPin, newPin) => {
    const isCurrentValid = await verifyPin(currentPin);
    if (!isCurrentValid) {
      throw new Error('Current security PIN is incorrect.');
    }
    if (!newPin || newPin.length < 4) {
      throw new Error('New PIN must be at least 4 characters/digits.');
    }

    const newHash = await hashPin(String(newPin).trim());
    localStorage.setItem('kiddorin_cost_pin_hash', newHash);
    toast.success('✓ Security PIN changed successfully!');
    return true;
  };

  const resetPinToDefault = async (currentPin) => {
    const isCurrentValid = await verifyPin(currentPin);
    if (!isCurrentValid) {
      throw new Error('Current security PIN is incorrect.');
    }
    localStorage.removeItem('kiddorin_cost_pin_hash');
    toast.success('✓ Security PIN reset to default.');
    return true;
  };

  return (
    <PricePrivacyContext.Provider
      value={{
        isPriceUnlocked,
        unlockPrices,
        lockPrices,
        isUnlockModalOpen,
        openUnlockModal,
        closeUnlockModal,
        changePin,
        resetPinToDefault
      }}
    >
      {children}
    </PricePrivacyContext.Provider>
  );
};

