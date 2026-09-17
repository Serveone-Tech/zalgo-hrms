export type RazorpayOrder = { orderId: string; amount: string | number; currency: string; keyId: string; plan?: { name: string }; company?: { name: string; email: string | null; mobile: string | null } };
export type RazorpaySuccess = { orderId: string; paymentId: string; signature: string };

let scriptPromise: Promise<void> | null = null;
function loadCheckoutScript() {
  if ((window as any).Razorpay) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(); s.onerror = () => reject(new Error("Could not load Razorpay checkout"));
    document.body.appendChild(s);
  });
  return scriptPromise;
}

// Opens Razorpay Checkout for a server-created order and resolves with the payment
// ids to verify server-side. Rejects on dismiss/failure so callers can offer a retry.
export async function payWithRazorpay(order: RazorpayOrder, opts?: { name?: string; description?: string }): Promise<RazorpaySuccess> {
  if (!order.keyId) throw new Error("Payments are not configured yet. Please contact Zalgo Infotech.");
  await loadCheckoutScript();
  return new Promise((resolve, reject) => {
    const rzp = new (window as any).Razorpay({
      key: order.keyId, amount: Math.round(Number(order.amount) * 100), currency: order.currency, order_id: order.orderId,
      name: "Zalgo HRMS", description: opts?.description ?? order.plan?.name ?? "Subscription",
      prefill: { name: order.company?.name, email: order.company?.email ?? undefined, contact: order.company?.mobile ?? undefined },
      theme: { color: "#0f766e" },
      handler: (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
        resolve({ orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature }),
      modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
    });
    rzp.on("payment.failed", () => reject(new Error("Payment failed")));
    rzp.open();
  });
}
