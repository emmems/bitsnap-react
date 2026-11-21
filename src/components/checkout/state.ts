import { create } from 'zustand';

interface CheckoutStore {
  isCartVisible: boolean;
  /** A message for the buyer raised outside of the drawer; the drawer shows it as an error. */
  notice: string | undefined;
  setNotice: (notice: string | undefined) => void;
  numberOfProductsInCart: number;
  /** Quantity of the open cart's unavailable lines; the cart header leaves it out of its count. */
  unavailableInCart: number;
  showCart: () => void;
  hideCart: () => void;
  setNumberOfProductsInCart: (numberOfProductsInCart: number) => void;
}

export const useCheckoutStore = create<CheckoutStore>((set) => ({
  isCartVisible: false,
  notice: undefined,
  setNotice: (notice) => set((state) => ({ ...state, notice })),
  numberOfProductsInCart: 0,
  unavailableInCart: 0,
  showCart: () => set((state) => ({ ...state, isCartVisible: true })),
  hideCart: () => set((state) => ({ ...state, isCartVisible: false })),
  setNumberOfProductsInCart: (numberOfProductsInCart: number) => set((state) => ({ ...state, numberOfProductsInCart: numberOfProductsInCart })),
}))
