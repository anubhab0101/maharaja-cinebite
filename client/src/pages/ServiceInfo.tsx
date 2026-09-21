import React from "react";
import { useLocation } from "wouter";
import { POLICY_VERSION } from "@shared/consent";
import {
  CINEMA_CONTACT,
  SOFTWARE_CREDIT,
  FOOD_OPERATOR,
} from "@shared/operator";

export const servicePages: Record<
  string,
  { title: string; paragraphs: string[] }
> = {
  "/about": {
    title: "About CineBite",
    paragraphs: [
      SOFTWARE_CREDIT,
      FOOD_OPERATOR,
      "ASAYLES Tech provides the software. The cinema's in-house counter is responsible for food, preparation, availability, fulfilment and resolving food-order complaints. This is a food-ordering service, not the cinema's movie-ticket booking website.",
    ],
  },
  "/privacy": {
    title: "Privacy Policy",
    paragraphs: [
      "Delayed-order chat is optional and available only for confirmed orders that remain undelivered 20 minutes after placement. Your order number and full order phone number verify access; messages and timestamps are shared with authorised cinema staff for order support. Do not send sensitive information. Delivery closes the conversation and deletes its messages from the main application database; backup copies may remain until backup expiry. Chat deletion does not delete the order, payment or legally retained records.",
      SOFTWARE_CREDIT,
      FOOD_OPERATOR,
      "For an order, CineBites collects your name, phone number, cinema/show/seat, selected items and any delivery instructions. These are used to process payment, prepare and deliver food, verify collection and resolve order issues. Do not enter sensitive personal information in delivery instructions.",
      "The stored order includes your name, full phone number in the order snapshot, last four phone digits, seat, items and payment status. Checkout also passes contact details to Razorpay. Payment credentials are entered with the payment provider, not in CineBites order forms. Authorised cinema staff can access operational order details. Staff sign-in uses Google.",
      "This checkout consent does not authorise promotional messages or advertising. Order-linked consent choices, policy version and a server timestamp are recorded. Your browser also stores recent order details for tracking; see Browser storage for details.",
      "Maharaja operates the food-ordering service; ASAYLES Tech supplies CineBite software. The cinema's published general helpdesk appears on Contact & support. A designated privacy/grievance contact and the operator's registered legal details still require confirmation. Requests for access, correction, withdrawal or deletion require identity verification; withdrawal does not automatically cancel payment or erase records required for disputes or legal obligations.",
      "Offer notifications are optional and separate from order consent. Where enabled, we store a browser push endpoint, encryption keys, a hashed withdrawal token, consent version/time and expiry to deliver cinema offers. The browser's Google or Mozilla push service transports notifications. Delivery stops after 90 days unless renewed, or earlier when you opt out. Enrollment remains unavailable until operator configuration and review are complete. Declining does not prevent ordering.",
      "Retention and deletion: the pilot cleanup tool enforces at least one calendar year from the latest recorded order-processing event before a completed order can be considered for deletion. This safeguard is informed by DPDP Rules 2025, Rule 8(3); it does not mean all records may be deleted after one year. Read Retention & deletion below for exceptions and implementation status.",
      "The cinema must confirm its legal identity, privacy contact, processors and applicable legal/accounting retention periods before paid launch. Deletion is a reviewed operator process, not an automatic daily purge. No blanket three-month deletion promise or full-compliance certification is made.",
    ],
  },
  "/retention": {
    title: "Retention & deletion — implementation notice",
    paragraphs: [
      "Chat messages have a separate, shorter lifecycle than order records: marking the order delivered deletes its chat in the same database transaction. If the order is still undelivered, messages remain for staff support. Delivery must be accurately recorded by staff; this is not a timed promise of delivery. Backups and screenshots are not remotely erased by this action. Any legal preservation requirement must be reviewed by the operator before enabling this ephemeral chat workflow.",
      "Retention means how long information is kept. Deletion means removing eligible information when it is no longer required. Our ordinary-order baseline is one calendar year, assessed separately for each order from its latest recorded processing event. This is not a promise to erase every record and backup automatically on day 365.",
      "Ordinary completed-order records: the cleanup tool applies a one-calendar-year minimum from the latest recorded order update, payment, consent or associated order-audit event. The published DPDP Rules 2025 have phased commencement. This pilot uses the one-year safeguard prospectively; it is not a statement that every provision is already in force or that every record expires in one year.",
      "Longer legal retention takes priority. Tax/accounting records, claims, investigations and legal holds may need longer storage. For example, CGST section 36 sets a 72-month rule for covered accounting records, calculated from the relevant annual-return due date, with further provisions for proceedings. The cinema must determine what applies to its business; we do not calculate this as simply six years from your purchase.",
      "Actual cleanup is preview-first. An authorised database operator must review the exact order, obtain a documented legal/accounting release, confirm no outstanding hold, and run cleanup during maintenance. Active orders, unresolved payments, legacy records and orders with refund records are blocked by this tool. Such blocked records need separate review, not silent deletion or unlimited retention without a reason.",
      "After approval and eligibility checks, the tool deletes that order, its item records, consent evidence, payment records and associated order audit events from the primary application database in one transaction. A separate cleanup receipt records counts, time and a review reference without copying the customer's name, phone or order identifier. No live deletion or recurring purge is claimed merely because this page exists.",
      "Backups, replicas, administrator exports, payment-provider records and copies on customer devices are separate. Primary-database cleanup cannot erase those automatically. Operators must document their expiry/access controls, prevent deleted data returning after a backup restore, and coordinate processor erasure where applicable. The backup lifecycle is not yet verified for this pilot.",
      "Browser storage holds recent order details for tracking and is separate from the primary database. You can clear site storage in your browser; save any details needed for a payment dispute first. Clearing it does not cancel an order or erase legally retained server records.",
      "Retention is separate from policy acceptance. Current guest checkout records explicit acceptance for each new order and does not treat a matching phone number as proof of a returning customer's identity. Historical acceptance timestamps are not rewritten. One-year reusable customer acceptance is not currently implemented. A changed policy, new purpose or withdrawn consent may require fresh acceptance sooner than one year; no consent is automatically renewed on its anniversary.",
      "Optional offer subscriptions have a separate 90-day delivery expiry. Expired subscriptions cannot receive offers; removal is performed during subscription/admin maintenance, not by a guaranteed daily timer. Opting out removes the subscription from the main database. Separate consent audit evidence, backups and exports require their own approved retention schedule; this is not a promise that all copies disappear immediately.",
      "To request access, correction or deletion, the cinema must publish its verified privacy contact before paid launch. Requests require appropriate identity verification and a documented decision explaining any continued legal retention. That customer-request workflow and verified contact remain pending; these safeguards alone are not a compliance certificate.",
    ],
  },
  "/terms": {
    title: "Terms & Conditions",
    paragraphs: [
      SOFTWARE_CREDIT,
      FOOD_OPERATOR,
      "CineBites supports cinema in-seat food ordering, not movie-ticket sales. Use the active cinema QR and check your screen, seat, items and payable amount before payment. Availability and scheduled ordering windows apply; delivery times are estimates.",
      "A pending or failed payment is not a kitchen-confirmed order. Use order tracking to check confirmation. Do not submit repeated payments merely because confirmation is delayed.",
      "Contact support before ordering if you have an allergy or dietary requirement; the app does not verify allergen suitability. Misuse of staff accounts or another customer's order details is not permitted.",
      "Read the separate privacy, retention, delivery and refund notices. Nothing in these terms waives applicable consumer rights. Published cinema contact details are provided on Contact & support; final registered contracting details and any outstanding launch requirements must be confirmed by the cinema.",
    ],
  },
  "/refunds": {
    title: "Refund & Cancellation",
    paragraphs: [
      "Once an order is placed, change-of-mind cancellations and refunds are not available. Food preparation can begin after payment confirmation. This policy does not remove remedies for non-delivery, defective or incorrect food, duplicate charges or other rights required by applicable law. Report these issues to cinema staff with your order reference.",
      "A refund request is not a completed refund. Staff must review it and, if approved, process it through the payment provider. Keep your payment reference and request confirmation. Never share an OTP, PIN or full card details.",
      "If payment was deducted but the order remains pending, check tracking and contact support before paying again. No fixed refund-processing time is promised by this draft. The operator must approve eligibility, cancellation cutoffs and refund timelines before paid launch; applicable consumer rights remain unaffected.",
    ],
  },
  "/delivery": {
    title: "Delivery & Ordering Window",
    paragraphs: [
      "Delivery is to the configured cinema seat, not to an external postal address. Enter the correct seat and remain available for handover. Staff may ask for your name and the last four phone digits to verify delivery.",
      "New ordering opens 15 minutes after the scheduled show start and closes 30 minutes before the published runtime ends. Kitchen pauses and schedule freshness checks may also prevent checkout. Actual projector delays or intervals are not automatically detected.",
      "For a delayed, missing or incorrect order, contact support with your order number. Kitchen status is an estimate, not a guaranteed delivery deadline.",
    ],
  },
  "/cookies": {
    title: "Cookies, Storage & Notifications",
    paragraphs: [
      "The installable staff web app uses a service worker to store a public offline notice and its stylesheet on your device. It does not store order/API responses or authenticated pages in that offline cache. Staff may explicitly enable sound and browser notifications; notification text does not include customer names, phone numbers or seat details. You can revoke notification permission or clear site data in browser settings. Closed-app staff-order push delivery is not configured in this version.",
      "CineBite uses staff authentication cookies and browser storage for theme and recent-order tracking. Customer pages do not offer app installation; only authorised staff receive the install option. Browsers may still allow customers to save a shortcut independently.",
      "Optional cinema offers require a separate unchecked choice and browser notification permission where supported. The browser stores the push subscription; this site stores a browser-specific withdrawal token, endpoint and expiry so you can stop offers. Use Stop offer notifications on the menu before clearing site storage, or revoke permission in browser settings. Clearing storage can remove the site's withdrawal receipt without automatically deleting the server subscription. No optional advertising analytics is introduced by this feature.",
      "Offer enrollment may be disabled until setup is complete. Customer iPhone/iPad web push is not offered because it requires Home Screen installation. Notification arrival or loudness is not guaranteed: browser, network, device volume and Do Not Disturb settings apply. Staff sound alerts are separate from promotional notifications; closed-app staff-order push is not configured.",
      "Recent orders can include your name, seat, order reference and last four phone digits. On a shared device, clear this site's browser storage after saving the details needed to track your order. Clearing storage may remove saved tracking and sign-in information; it does not delete server records or cancel an order.",
      "Google sign-in and Razorpay checkout are separate provider services and may use their own storage. CineBites loads Razorpay checkout only when you initiate payment, not while browsing the menu. Razorpay may process IP addresses, browser information, device identifiers and cookies for payments and fraud prevention. Keys such as rzp_device_id and rzp_checkout_anon_id are provider-managed identifiers, not CineBites login tokens; their presence and lifetime can vary. See Razorpay's buyer privacy notice at https://razorpay.com/buyer-privacy-notice/.",
      "Staff sign-in uses an HttpOnly session cookie (Secure in production), not a token mirrored in browser storage. Obsolete preview-runtime profile/token storage is removed when this version loads. Recent order tracking details remain browser-readable: avoid shared devices and clear site data when finished. This does not delete cinema or payment-provider records.",
      "Any future optional analytics or marketing integration must be reviewed and gated before loading. This notice alone does not establish GDPR/CCPA or other legal compliance; applicable obligations require operator review.",
    ],
  },
  "/support": {
    title: "Contact & support",
    paragraphs: [
      "The details below are the cinema's general helpdesk published on its own website, not the developer's personal number. For an order problem at the venue, ask the in-house F&B counter and keep your order number, show and seat ready. Never share a payment OTP, PIN, password or full card details.",
      "The cinema must confirm that this helpdesk handles CineBite F&B issues and designate its privacy/grievance contact before paid launch. Published website details are not proof that a phone or inbox is currently monitored. No support-hours or response-time guarantee is made.",
    ],
  },
  "/payment-failed": {
    title: "Payment not confirmed",
    paragraphs: [
      "This information page does not determine whether your payment succeeded. Check your saved order in tracking. If money was deducted, do not immediately pay again: keep the payment reference and contact support.",
      "Only server-verified payment confirmation releases an order to the kitchen. Closing a payment window does not prove that no debit occurred.",
    ],
  },
};

export default function ServiceInfo() {
  const [path] = useLocation();
  const page = servicePages[path] ?? servicePages["/support"];
  return (
    <main className="min-h-screen bg-[#101010] text-white px-5 py-10">
      <article className="mx-auto max-w-3xl space-y-5">
        <a href="/" className="underline text-orange-300">
          Back to CineBite
        </a>
        <h1 className="text-3xl font-semibold">{page.title}</h1>
        <p className="text-sm text-white/60">
          Notice version: {POLICY_VERSION}
        </p>
        {page.paragraphs.map(text => (
          <p key={text} className="leading-7 text-white/80">
            {text}
          </p>
        ))}
        {path === "/support" && (
          <section
            aria-label="Published cinema contact"
            className="rounded-xl border border-white/30 p-4 space-y-3 break-words"
          >
            <h2 className="text-xl font-semibold">{CINEMA_CONTACT.name}</h2>
            <p>{CINEMA_CONTACT.address}</p>
            {CINEMA_CONTACT.phones.map(phone => (
              <p key={phone}>
                <a
                  className="underline text-orange-300"
                  href={`tel:${phone.replace(/\s/g, "")}`}
                >
                  {phone}
                </a>
              </p>
            ))}
            <p>
              <a
                className="underline text-orange-300 break-all"
                href={`mailto:${CINEMA_CONTACT.email}`}
              >
                {CINEMA_CONTACT.email}
              </a>
            </p>
            <p className="text-sm">
              <a
                href={CINEMA_CONTACT.source}
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                Official cinema contact page
              </a>{" "}
              — checked {CINEMA_CONTACT.checkedOn}.
            </p>
          </section>
        )}
        <p>
          <a href="/support" className="underline text-orange-300">
            Cinema contact & support
          </a>
        </p>
        <p>
          <a href="/retention" className="underline text-orange-300">
            Retention & deletion details
          </a>
        </p>
        {path === "/retention" && (
          <p className="text-sm">
            Official sources:{" "}
            <a
              className="underline"
              href="https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf"
              target="_blank"
              rel="noreferrer"
            >
              DPDP Rules 2025 (rules 1 and 8)
            </a>{" "}
            ·{" "}
            <a
              className="underline"
              href="https://cbic-gst.gov.in/hindi/CGST-bill-e.html"
              target="_blank"
              rel="noreferrer"
            >
              CGST Act (section 36)
            </a>
          </p>
        )}
        <a href="/track" className="underline text-orange-300">
          Check saved order
        </a>
      </article>
    </main>
  );
}
