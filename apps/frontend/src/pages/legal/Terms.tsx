import { LegalLayout } from "./LegalLayout";

export default function Terms() {
  return (
    <LegalLayout title="Terms of Service" updated="17 September 2026">
      <section>
        <h2 className="font-bold text-base mb-1">1. Agreement</h2>
        <p>By creating an account on Zalgo HRMS ("the Service"), operated by Zalgo Infotech Private Limited ("Zalgo Infotech", "we", "us"), you agree to these Terms of Service. If you do not agree, do not use the Service.</p>
      </section>
      <section>
        <h2 className="font-bold text-base mb-1">2. The Service</h2>
        <p>Zalgo HRMS is a multi-tenant SaaS platform for HR management, including employee records, attendance, leave, payroll and related modules, offered under the subscription plan you choose.</p>
      </section>
      <section>
        <h2 className="font-bold text-base mb-1">3. Accounts and data</h2>
        <p>You are responsible for the accuracy of the company and employee data you enter, and for keeping your login credentials secure. You own your company's data; Zalgo Infotech acts as a data processor on your behalf.</p>
      </section>
      <section>
        <h2 className="font-bold text-base mb-1">4. Subscriptions, trials and payment</h2>
        <p>Paid plans are billed monthly or yearly as selected at checkout, in Indian Rupees inclusive of applicable GST. Free trials, where offered, convert to a paid subscription only when you explicitly choose to pay. Fees are non-refundable except where required by law.</p>
      </section>
      <section>
        <h2 className="font-bold text-base mb-1">5. Termination</h2>
        <p>You may cancel your subscription at any time from the Subscription page. We may suspend or terminate accounts that violate these Terms or applicable law.</p>
      </section>
      <section>
        <h2 className="font-bold text-base mb-1">6. Limitation of liability</h2>
        <p>The Service is provided "as is". To the extent permitted by law, Zalgo Infotech is not liable for indirect or consequential damages arising from use of the Service.</p>
      </section>
      <section>
        <h2 className="font-bold text-base mb-1">7. Contact</h2>
        <p>Questions about these Terms can be sent to Zalgo Infotech Private Limited through the contact details on your account.</p>
      </section>
    </LegalLayout>
  );
}
