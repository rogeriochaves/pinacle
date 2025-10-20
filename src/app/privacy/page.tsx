import Image from "next/image";
import Link from "next/link";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <Link
            href="/"
            className="flex items-center justify-center space-x-2 mb-8"
          >
            <Image
              src="/logo.png"
              alt="Pinacle Logo"
              className="h-10 w-10"
              width={40}
              height={40}
            />
            <span className="font-bold font-mono text-2xl text-white">
              pinacle
            </span>
          </Link>
          <h1 className="text-4xl font-bold font-mono text-white mb-3">
            Privacy Policy
          </h1>
          <p className="text-gray-400">Last updated: January 20, 2025</p>
        </div>

        {/* Content */}
        <div className="bg-white rounded-lg p-8 space-y-8">
          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              1. Introduction
            </h2>
            <p className="text-gray-700 leading-relaxed">
              This Privacy Policy explains how Pinacle.dev, operated by
              Inbox Narrator ("we," "us," or "our"), collects, uses, and protects
              your personal information when you use our Service. We are
              committed to protecting your privacy and complying with the General
              Data Protection Regulation (GDPR) and other applicable data
              protection laws.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              2. Data Controller
            </h2>
            <p className="text-gray-700 leading-relaxed">
              The data controller responsible for your personal data is
              Inbox Narrator, registered in the Netherlands. You can contact us
              through the Pinacle.dev website regarding any questions about your
              personal data.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              3. Information We Collect
            </h2>
            <div className="space-y-4 text-gray-700">
              <div>
                <h3 className="font-bold mb-2">3.1 Account Information</h3>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Name and email address</li>
                  <li>GitHub account information (if using GitHub OAuth)</li>
                  <li>Password (encrypted)</li>
                  <li>Account creation date and last login</li>
                </ul>
              </div>
              <div>
                <h3 className="font-bold mb-2">3.2 Usage Data</h3>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Development environment configurations</li>
                  <li>Resource usage metrics (CPU, memory, storage)</li>
                  <li>IP addresses and access logs</li>
                  <li>Service usage patterns and timestamps</li>
                </ul>
              </div>
              <div>
                <h3 className="font-bold mb-2">3.3 Technical Data</h3>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Browser type and version</li>
                  <li>Operating system</li>
                  <li>Cookies and similar tracking technologies</li>
                </ul>
              </div>
              <div>
                <h3 className="font-bold mb-2">3.4 User Content</h3>
                <ul className="list-disc pl-6 space-y-1">
                  <li>
                    Source code, files, and data you store in your development
                    environments
                  </li>
                  <li>GitHub repositories you connect to the Service</li>
                  <li>Environment variables and configurations</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              4. How We Use Your Information
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We use your personal data for the following purposes:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li>
                <strong>Service Provision:</strong> To create and manage your
                development environments
              </li>
              <li>
                <strong>Authentication:</strong> To verify your identity and
                secure your account
              </li>
              <li>
                <strong>Resource Management:</strong> To monitor and allocate
                computing resources
              </li>
              <li>
                <strong>Security:</strong> To detect and prevent abuse,
                unauthorized access, and violations of our Terms of Service
              </li>
              <li>
                <strong>Communication:</strong> To send important service updates
                and notifications
              </li>
              <li>
                <strong>Compliance:</strong> To comply with legal obligations and
                respond to lawful requests
              </li>
              <li>
                <strong>Service Improvement:</strong> To analyze usage patterns
                and improve the Service
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              5. Legal Basis for Processing (GDPR)
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Under GDPR, we process your personal data based on:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li>
                <strong>Contract Performance:</strong> Processing necessary to
                provide the Service you requested
              </li>
              <li>
                <strong>Legitimate Interests:</strong> Security monitoring,
                fraud prevention, and service improvement
              </li>
              <li>
                <strong>Legal Obligation:</strong> Compliance with applicable
                laws and regulations
              </li>
              <li>
                <strong>Consent:</strong> For optional features where you
                provide explicit consent
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              6. Data Sharing and Disclosure
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We do not sell your personal data. We may share your information
              with:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li>
                <strong>Service Providers:</strong> Third-party infrastructure
                providers (cloud hosting, authentication services) who help us
                operate the Service
              </li>
              <li>
                <strong>Legal Requirements:</strong> Law enforcement or
                regulatory authorities when required by law
              </li>
              <li>
                <strong>Security Incidents:</strong> Relevant parties in case of
                security breaches or abuse investigations
              </li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              All third-party service providers are required to maintain
              appropriate data protection standards and use your data only for
              the purposes we specify.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              7. Data Retention
            </h2>
            <p className="text-gray-700 leading-relaxed">
              We retain your personal data for as long as your account is active
              or as needed to provide the Service. When you delete your account
              or we terminate it for policy violations, your data is permanently
              deleted within 30 days. Some data may be retained longer if
              required by law or for legitimate business purposes (e.g., fraud
              prevention, legal disputes).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              8. Your Rights Under GDPR
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              As an EU data subject, you have the following rights:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li>
                <strong>Right of Access:</strong> Request a copy of your
                personal data
              </li>
              <li>
                <strong>Right to Rectification:</strong> Correct inaccurate or
                incomplete data
              </li>
              <li>
                <strong>Right to Erasure:</strong> Request deletion of your
                personal data
              </li>
              <li>
                <strong>Right to Restriction:</strong> Limit how we process your
                data
              </li>
              <li>
                <strong>Right to Data Portability:</strong> Receive your data in
                a structured, machine-readable format
              </li>
              <li>
                <strong>Right to Object:</strong> Object to processing based on
                legitimate interests
              </li>
              <li>
                <strong>Right to Withdraw Consent:</strong> Withdraw consent at
                any time where processing is based on consent
              </li>
              <li>
                <strong>Right to Lodge a Complaint:</strong> File a complaint
                with your local data protection authority
              </li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              To exercise any of these rights, please contact us through the
              Pinacle.dev website. We will respond to your request within 30
              days.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              9. Data Security
            </h2>
            <p className="text-gray-700 leading-relaxed">
              We implement appropriate technical and organizational measures to
              protect your personal data, including encryption, access controls,
              and regular security assessments. However, no method of
              transmission over the internet is 100% secure, and we cannot
              guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              10. International Data Transfers
            </h2>
            <p className="text-gray-700 leading-relaxed">
              Your data may be processed in countries outside the European
              Economic Area (EEA). When we transfer data internationally, we
              ensure appropriate safeguards are in place, such as Standard
              Contractual Clauses approved by the European Commission.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">11. Cookies</h2>
            <p className="text-gray-700 leading-relaxed">
              We use essential cookies to operate the Service, including
              authentication and session management. We do not use third-party
              advertising or tracking cookies. You can control cookies through
              your browser settings, but disabling essential cookies may affect
              Service functionality.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              12. Children's Privacy
            </h2>
            <p className="text-gray-700 leading-relaxed">
              The Service is not intended for children under 16 years of age. We
              do not knowingly collect personal data from children. If you
              believe we have collected data from a child, please contact us
              immediately.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              13. Changes to This Privacy Policy
            </h2>
            <p className="text-gray-700 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify
              you of material changes via email or through the Service. Your
              continued use after such changes constitutes acceptance of the
              updated Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              14. Contact Us
            </h2>
            <p className="text-gray-700 leading-relaxed">
              For questions about this Privacy Policy or to exercise your rights,
              please contact us through the Pinacle.dev website.
            </p>
          </section>

          <div className="pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Data Controller: Inbox Narrator (Netherlands)
              <br />
              Service: Pinacle.dev
              <br />
              GDPR Compliance: European Union
            </p>
          </div>
        </div>

        <div className="text-center mt-8">
          <Link
            href="/"
            className="text-gray-400 hover:text-gray-300 font-mono text-sm underline"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

