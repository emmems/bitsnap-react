export function buildProductURL(productID: string): string {
  return `product/${encodeURIComponent(productID)}`;
}
