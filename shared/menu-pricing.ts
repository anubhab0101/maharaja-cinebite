/** Price calculation is shared for display; the server remains authoritative. */
export function menuPrice(item: {
  pricePaise: number;
  discountPercent?: number;
}) {
  const discount = item.discountPercent ?? 0;
  if (
    !Number.isSafeInteger(item.pricePaise) ||
    item.pricePaise < 100 ||
    !Number.isInteger(discount) ||
    discount < 0 ||
    discount > 90
  )
    throw new Error("Invalid menu pricing");
  return Math.round((item.pricePaise * (100 - discount)) / 100);
}
