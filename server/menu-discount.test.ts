import { describe, it, expect, vi, beforeEach } from "vitest";
import { menuPrice } from "../shared/menu-pricing";
import { rupees } from "../shared/cinebites";
import { createOrder } from "./cinebites-store";
import { readEntities, persistOrder } from "./durable-store";
vi.mock("./durable-store", () => ({
  database: vi.fn(async () => null),
  readEntities: vi.fn(),
  persistOrder: vi.fn(async () => {}),
  readOrders: vi.fn(),
  readOrder: vi.fn(),
  writeEntity: vi.fn(),
  persistStatus: vi.fn(),
}));
const item = {
  id: "test",
  name: "Test food",
  pricePaise: 999,
  discountPercent: 15,
  available: true,
  options: [],
};
const order = {
  screen: "Test",
  seat: "A1",
  customerName: "Test User",
  phone: "9876543210",
  items: [{ itemId: "test", quantity: 2 }],
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readEntities).mockResolvedValue([{ ...item }]);
});
describe("per-item discounts", () => {
  it("uses integer paise and displays fractions", () => {
    expect(menuPrice(item)).toBe(849);
    expect(rupees(849)).toBe("₹8.49");
    expect(menuPrice({ pricePaise: 10000 })).toBe(10000);
  });
  it.each([-1, 91, 100, 2.5, NaN])(
    "rejects invalid percentage %s",
    discountPercent =>
      expect(() => menuPrice({ ...item, discountPercent })).toThrow()
  );
  it("calculates on server, preserves the price snapshot and leaves fee undiscounted", async () => {
    const result = await createOrder(order);
    expect(result.totalPaise).toBe(2698);
    expect(result.items[0]).toMatchObject({
      pricePaise: 849,
      originalPricePaise: 999,
      discountPercent: 15,
    });
    vi.mocked(readEntities).mockResolvedValue([
      { ...item, discountPercent: 0 },
    ]);
    const next = await createOrder(order);
    expect(next.totalPaise).toBe(2998);
    expect(result.totalPaise).toBe(2698);
  });
  it("rejects stale displayed totals before persisting an order", async () => {
    await expect(
      createOrder({ ...order, expectedTotalPaise: 2998 })
    ).rejects.toThrow("Menu price or discount changed");
    expect(persistOrder).not.toHaveBeenCalled();
  });
});
