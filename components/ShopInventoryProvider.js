import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebaseConfig";
import {
  ensureShopInventoryInitialized,
  isFarBgOwned,
  isPlantOwned,
  isPotOwned,
  isShelfColorOwned,
  isShopItemOwned,
  isWallBgOwned,
  isWindowFrameOwned,
  purchaseShopItem,
  subscribeShopInventory,
} from "../utils/shopInventory";

const ShopInventoryContext = createContext(null);

export function ShopInventoryProvider({ children }) {
  const [uid, setUid] = useState(auth.currentUser?.uid ?? null);
  const [inventory, setInventory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchaseLoadingId, setPurchaseLoadingId] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!uid) {
      setInventory(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    ensureShopInventoryInitialized(uid)
      .catch((error) => {
        console.error("Shop inventory init failed:", error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const unsub = subscribeShopInventory(
      uid,
      (nextInventory) => {
        if (!cancelled) setInventory(nextInventory);
      },
      (error) => {
        console.error("Shop inventory listener failed:", error);
      }
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [uid]);

  const coinBalance = inventory?.coinBalance ?? 0;

  const isItemOwned = useCallback(
    (item) => isShopItemOwned(inventory, item),
    [inventory]
  );

  const buyItem = useCallback(async (itemId) => {
    setPurchaseLoadingId(itemId);
    try {
      await purchaseShopItem(itemId);
    } finally {
      setPurchaseLoadingId(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      inventory,
      coinBalance,
      loading,
      purchaseLoadingId,
      ownedPlants: inventory?.ownedPlants ?? {},
      ownedPots: inventory?.ownedPots ?? {},
      ownedFarBg: inventory?.ownedFarBg ?? {},
      ownedWindowFrames: inventory?.ownedWindowFrames ?? {},
      ownedWallBg: inventory?.ownedWallBg ?? {},
      ownedShelfColors: inventory?.ownedShelfColors ?? {},
      isPlantOwned: (species) => isPlantOwned(inventory, species),
      isPotOwned: (potKey) => isPotOwned(inventory, potKey),
      isFarBgOwned: (index) => isFarBgOwned(inventory, index),
      isWindowFrameOwned: (index) => isWindowFrameOwned(inventory, index),
      isWallBgOwned: (index) => isWallBgOwned(inventory, index),
      isShelfColorOwned: (index) => isShelfColorOwned(inventory, index),
      isItemOwned,
      buyItem,
    }),
    [inventory, coinBalance, loading, purchaseLoadingId, isItemOwned, buyItem]
  );

  return (
    <ShopInventoryContext.Provider value={value}>
      {children}
    </ShopInventoryContext.Provider>
  );
}

export function useShopInventory() {
  const context = useContext(ShopInventoryContext);
  if (!context) {
    throw new Error("useShopInventory must be used within ShopInventoryProvider");
  }
  return context;
}
