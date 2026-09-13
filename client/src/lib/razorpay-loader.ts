let loading: Promise<void> | undefined;
export function loadRazorpay(): Promise<void> {
  if (typeof (window as any).Razorpay === "function") return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.referrerPolicy = "no-referrer";
    const fail = () => {
      clearTimeout(timer);
      script.onload = script.onerror = null;
      script.remove();
      reject(new Error("Secure checkout could not load. Please try again."));
    };
    const timer = setTimeout(fail, 15000);
    script.onerror = fail;
    script.onload = () => {
      if (typeof (window as any).Razorpay !== "function") { fail(); return; }
      clearTimeout(timer);
      script.onload = script.onerror = null;
      resolve();
    };
    document.head.appendChild(script);
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}
