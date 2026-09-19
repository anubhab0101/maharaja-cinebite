import { useEffect, useState } from "react";

export default function ConnectionNotice() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return offline ? <div role="alert" className="bg-amber-100 px-4 py-3 text-center text-sm text-amber-950">Internet disconnected. Orders and payments need a connection. If you already paid, reconnect and check Track Order before paying again.</div> : null;
}
