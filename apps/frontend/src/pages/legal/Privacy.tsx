import { LegalLayout } from "./LegalLayout";

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" updated="17 September 2026">
      <section>
        <h2 className="font-bold text-base mb-1">1. What we collect</h2>
        <p>When you sign up, we collect your name, work email, mobile number and company details. As you use the Service, your company may add employee records, attendance, payroll and document data ("Customer Data").</p>
      </section>
      <section>
        <h2 className="font-bold text-base mb-1">2. How we use it</h2>
        <p>We use account information to operate the Service, process payments (via Razorpay), send transactional notifications, and provide support. Customer Data is used only to provide the Service to the company that owns it.</p>
      </section>
      <section>
        <h2 className="font-bold text-base mb-1">3. Payments</h2>
        <p>Payments are processed by Razorpay. We do not store your card or bank details — Razorpay handles that directly and shares only payment status and identifiers with us.</p>
      </section>
      <section>
        <h2 className="font-bold text-base mb-1">4. Data sharing</h2>
        <p>We do not sell personal data. Data is shared only with sub-processors necessary to run the Service (hosting, database, payments, email/SMS/WhatsApp providers you configure).</p>
      </section>
      <section>
        <h2 className="font-bold text-base mb-1">5. Data retention and deletion</h2>
        <p>Data is retained while your account is active. You may request deletion of your company's data by contacting Zalgo Infotech, subject to statutory retention requirements (e.g. payroll/tax records).</p>
      </section>
      <section>
        <h2 className="font-bold text-base mb-1">6. Security</h2>
        <p>We use industry-standard measures (encrypted connections, hashed passwords, tenant isolation) to protect your data, but no system is 100% secure.</p>
      </section>
      <section>
        <h2 className="font-bold text-base mb-1">7. Contact</h2>
        <p>For privacy questions or data requests, contact Zalgo Infotech Private Limited through the contact details on your account.</p>
      </section>
    </LegalLayout>
  );
}
