type AlertOrder = { id: string; status: string; paymentStatus: string };
export function newConfirmedOrders(orders: AlertOrder[], seen: Set<string>) {
  return orders.filter(
    order =>
      order.paymentStatus === "CONFIRMED" &&
      order.status === "NEW" &&
      !seen.has(order.id)
  );
}
export function speakNewOrder() {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window))
    return;
  // Do not build up an unbounded speech queue during a burst of orders.
  window.speechSynthesis.cancel();
  const speech = new SpeechSynthesisUtterance(
    "New order arrives. Please check the order queue."
  );
  speech.lang = "en-IN";
  speech.volume = 1;
  speech.rate = 0.9;
  window.speechSynthesis.speak(speech);
}
