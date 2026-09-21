import React from "react";
import { useLocation } from "wouter";
import { POLICY_VERSION } from "@shared/consent";

export const servicePages: Record<string, { title: string; paragraphs: string[] }> = {
  "/privacy": { title: "Privacy notice — pilot draft", paragraphs: [
    "For an order, CineBites collects your name, phone number, cinema/show/seat, selected items and any delivery instructions. These are used to process payment, prepare and deliver food, verify collection and resolve order issues. Do not enter sensitive personal information in delivery instructions.",
    "The stored order includes your name, full phone number in the order snapshot, last four phone digits, seat, items and payment status. Checkout also passes contact details to Razorpay. Payment credentials are entered with the payment provider, not in CineBites order forms. Authorised cinema staff can access operational order details. Staff sign-in uses Google.",
    "This checkout consent does not authorise promotional messages or advertising. Order-linked consent choices, policy version and a server timestamp are recorded. Your browser also stores recent order details for tracking; see Browser storage for details.",
    "The service operates under the cinema's business, not the software developer's business. The cinema must confirm its exact legal name and privacy contact before paid launch. Requests for access, correction, withdrawal or deletion require identity verification; withdrawal does not automatically cancel payment or erase records required for disputes or legal obligations.",
    "Retention and deletion: the pilot cleanup tool enforces at least one calendar year from the latest recorded order-processing event before a completed order can be considered for deletion. This safeguard is informed by DPDP Rules 2025, Rule 8(3); it does not mean all records may be deleted after one year. Read Retention & deletion below for exceptions and implementation status.",
    "The cinema must confirm its legal identity, privacy contact, processors and applicable legal/accounting retention periods before paid launch. Deletion is a reviewed operator process, not an automatic daily purge. No blanket three-month deletion promise or full-compliance certification is made.",
  ] },
  "/retention": { title: "Retention & deletion — implementation notice", paragraphs: [
    "Ordinary completed-order records: the cleanup tool applies a one-calendar-year minimum from the latest recorded order update, payment, consent or associated order-audit event. The published DPDP Rules 2025 have phased commencement. This pilot uses the one-year safeguard prospectively; it is not a statement that every provision is already in force or that every record expires in one year.",
    "Longer legal retention takes priority. Tax/accounting records, claims, investigations and legal holds may need longer storage. For example, CGST section 36 sets a 72-month rule for covered accounting records, calculated from the relevant annual-return due date, with further provisions for proceedings. The cinema must determine what applies to its business; we do not calculate this as simply six years from your purchase.",
    "Actual cleanup is preview-first. An authorised database operator must review the exact order, obtain a documented legal/accounting release, confirm no outstanding hold, and run cleanup during maintenance. Active orders, unresolved payments, legacy records and orders with refund records are blocked by this tool. Such blocked records need separate review, not silent deletion or unlimited retention without a reason.",
    "After approval and eligibility checks, the tool deletes that order, its item records, consent evidence, payment records and associated order audit events from the primary application database in one transaction. A separate cleanup receipt records counts, time and a review reference without copying the customer's name, phone or order identifier. No live deletion or recurring purge is claimed merely because this page exists.",
    "Backups, replicas, administrator exports, payment-provider records and copies on customer devices are separate. Primary-database cleanup cannot erase those automatically. Operators must document their expiry/access controls, prevent deleted data returning after a backup restore, and coordinate processor erasure where applicable. The backup lifecycle is not yet verified for this pilot.",
    "Browser storage holds recent order details for tracking and is separate from the primary database. You can clear site storage in your browser; save any details needed for a payment dispute first. Clearing it does not cancel an order or erase legally retained server records.",
    "To request access, correction or deletion, the cinema must publish its verified privacy contact before paid launch. Requests require appropriate identity verification and a documented decision explaining any continued legal retention. That customer-request workflow and verified contact remain pending; these safeguards alone are not a compliance certificate.",
  ] },
  "/terms": { title: "Terms of service — pilot draft", paragraphs: [
    "CineBites supports cinema in-seat food ordering, not movie-ticket sales. Use the active cinema QR and check your screen, seat, items and payable amount before payment. Availability and scheduled ordering windows apply; delivery times are estimates.",
    "A pending or failed payment is not a kitchen-confirmed order. Use order tracking to check confirmation. Do not submit repeated payments merely because confirmation is delayed.",
    "Contact support before ordering if you have an allergy or dietary requirement; the app does not verify allergen suitability. Misuse of staff accounts or another customer's order details is not permitted.",
    "Read the separate privacy, delivery and refund notices. Nothing in this draft is intended to waive applicable consumer rights. The contracting operator's legal name/address and final commercial terms require approval before paid launch.",
  ] },
  "/refunds": { title: "Refund & cancellation — pilot draft", paragraphs: [
    "Once an order is placed, change-of-mind cancellations and refunds are not available. Food preparation can begin after payment confirmation. This policy does not remove remedies for non-delivery, defective or incorrect food, duplicate charges or other rights required by applicable law. Report these issues to cinema staff with your order reference.",
    "A refund request is not a completed refund. Staff must review it and, if approved, process it through the payment provider. Keep your payment reference and request confirmation. Never share an OTP, PIN or full card details.",
    "If payment was deducted but the order remains pending, check tracking and contact support before paying again. No fixed refund-processing time is promised by this draft. The operator must approve eligibility, cancellation cutoffs and refund timelines before paid launch; applicable consumer rights remain unaffected.",
  ] },
  "/delivery": { title: "Cinema delivery", paragraphs: [
    "Delivery is to the configured cinema seat, not to an external postal address. Enter the correct seat and remain available for handover. Staff may ask for your name and the last four phone digits to verify delivery.",
    "New ordering opens 15 minutes after the scheduled show start and closes 30 minutes before the published runtime ends. Kitchen pauses and schedule freshness checks may also prevent checkout. Actual projector delays or intervals are not automatically detected.",
    "For a delayed, missing or incorrect order, contact support with your order number. Kitchen status is an estimate, not a guaranteed delivery deadline.",
  ] },
  "/cookies": { title: "Cookies & browser storage", paragraphs: [
    "The installable staff web app uses a service worker to store a public offline notice and its stylesheet on your device. It does not store order/API responses or authenticated pages in that offline cache. Staff may explicitly enable sound and browser notifications; notification text does not include customer names, phone numbers or seat details. You can revoke notification permission or clear site data in browser settings. Closed-app push delivery is not configured in this version.",
    "CineBites uses staff authentication cookies and browser storage for theme and recent-order tracking. The current app does not include an optional marketing/analytics tracker, so there is no advertising-consent toggle to enable.",
    "Recent orders can include your name, seat, order reference and last four phone digits. On a shared device, clear this site's browser storage after saving the details needed to track your order. Clearing storage may remove saved tracking and sign-in information; it does not delete server records or cancel an order.",
    "Google sign-in and Razorpay checkout are separate provider services and may use their own storage. CineBites loads Razorpay checkout only when you initiate payment, not while browsing the menu. Razorpay may process IP addresses, browser information, device identifiers and cookies for payments and fraud prevention. Keys such as rzp_device_id and rzp_checkout_anon_id are provider-managed identifiers, not CineBites login tokens; their presence and lifetime can vary. See Razorpay's buyer privacy notice at https://razorpay.com/buyer-privacy-notice/.",
    "Staff sign-in uses an HttpOnly session cookie (Secure in production), not a token mirrored in browser storage. Obsolete preview-runtime profile/token storage is removed when this version loads. Recent order tracking details remain browser-readable: avoid shared devices and clear site data when finished. This does not delete cinema or payment-provider records.",
    "Any future optional analytics or marketing integration must be reviewed and gated before loading. This notice alone does not establish GDPR/CCPA or other legal compliance; applicable obligations require operator review.",
  ] },
  "/support": { title: "Contact & support", paragraphs: [
    "The cinema's customer-support phone and email are awaiting confirmation. No developer phone number is published as customer support. For an order problem at the venue, ask cinema staff and keep your order number, show and seat ready. Never share a payment OTP, PIN, password or full card details.",
    "This service runs under the cinema's business. Its exact registered name, address, verified support hours and formal privacy/grievance contact must be confirmed before paid launch. No response-time guarantee is published yet.",
  ] },
  "/payment-failed": { title: "Payment not confirmed", paragraphs: [
    "This information page does not determine whether your payment succeeded. Check your saved order in tracking. If money was deducted, do not immediately pay again: keep the payment reference and contact support.",
    "Only server-verified payment confirmation releases an order to the kitchen. Closing a payment window does not prove that no debit occurred.",
  ] },
};

export default function ServiceInfo() {
  const [path] = useLocation();
  const page = servicePages[path] ?? servicePages["/support"];
  return <main className="min-h-screen bg-[#101010] text-white px-5 py-10">
    <article className="mx-auto max-w-3xl space-y-5">
      <a href="/" className="underline text-orange-300">Back to CineBites</a>
      <h1 className="text-3xl font-semibold">{page.title}</h1>
      <p className="text-sm text-white/60">Notice version: {POLICY_VERSION}</p>
      {page.paragraphs.map(text => <p key={text} className="leading-7 text-white/80">{text}</p>)}
      <p><a href="/support" className="underline text-orange-300">Cinema support — contact details pending</a></p>
      <p><a href="/retention" className="underline text-orange-300">Retention & deletion details</a></p>
      {path === "/retention" && <p className="text-sm">Official sources: <a className="underline" href="https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf" target="_blank" rel="noreferrer">DPDP Rules 2025 (rules 1 and 8)</a> · <a className="underline" href="https://cbic-gst.gov.in/hindi/CGST-bill-e.html" target="_blank" rel="noreferrer">CGST Act (section 36)</a></p>}
      <a href="/track" className="underline text-orange-300">Check saved order</a>
    </article>
  </main>;
}
