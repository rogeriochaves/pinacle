import Image from "next/image";
import Link from "next/link";

export default function TermsOfService() {
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
            Terms of Service
          </h1>
          <p className="text-gray-400">Last updated: January 20, 2025</p>
        </div>

        {/* Content */}
        <div className="bg-white rounded-lg p-8 space-y-8">
          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              1. Acceptance of Terms
            </h2>
            <p className="text-gray-700 leading-relaxed">
              By accessing or using Pinacle.dev ("Service"), operated by
              InboxNarrator, you agree to be bound by these Terms of Service.
              If you do not agree to these terms, please do not use the
              Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              2. Service Description
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Pinacle.dev provides cloud-based development environments for
              software development purposes. Our Service includes compute
              resources, development tools, and related infrastructure.
            </p>
            <p className="text-gray-700 leading-relaxed">
              The Service is intended solely for software development,
              prototyping, and related legitimate development activities.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              3. Acceptable Use Policy
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              You agree to use the Service only for lawful purposes and in
              accordance with these Terms. Specifically, you agree NOT to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li>
                Use the Service for cryptocurrency mining, including but not
                limited to Bitcoin, Ethereum, or any other cryptocurrency
              </li>
              <li>
                Engage in any illegal activities or activities that violate any
                applicable laws or regulations
              </li>
              <li>
                Abuse computing resources in ways that violate the intended use
                of software development
              </li>
              <li>
                Attempt to gain unauthorized access to other users' accounts or
                data
              </li>
              <li>
                Distribute malware, viruses, or any other malicious software
              </li>
              <li>
                Use the Service to attack, harm, or interfere with other
                services or networks
              </li>
              <li>
                Resell or redistribute the Service without explicit written
                permission
              </li>
              <li>
                Use the Service for commercial hosting of production
                applications (development and testing only)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              4. Account Termination and Data Deletion
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We reserve the right to suspend or terminate your account and
              delete your data immediately and without prior notice if:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li>
                We receive notifications of illegal activity or policy
                violations
              </li>
              <li>You violate any part of this Acceptable Use Policy</li>
              <li>We detect resource abuse or suspicious activity</li>
              <li>
                We are required to do so by law or governmental authority
              </li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              Upon termination, all your data, including code, files, and
              configurations, may be permanently deleted without the possibility
              of recovery. We recommend maintaining regular backups of your
              important data.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              5. User Responsibilities
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              You are responsible for:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li>
                Maintaining the security and confidentiality of your account
                credentials
              </li>
              <li>All activities that occur under your account</li>
              <li>Backing up your data regularly</li>
              <li>Ensuring your use complies with all applicable laws</li>
              <li>
                Any costs or damages resulting from your violation of these
                Terms
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              6. Billing and Refunds
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              You will be billed based on your resource usage as described in
              your selected pricing plan. Billing is calculated based on actual
              usage and occurs monthly.
            </p>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
              <p className="text-gray-800 font-semibold mb-2">
                No Refund Policy
              </p>
              <p className="text-gray-700 leading-relaxed">
                All charges are non-refundable except in the following specific
                circumstances: we will issue a refund only if you were charged
                for periods when the Service was unavailable due to issues on
                our end, such as failed provisioning, extended outages, or
                platform failures that prevented you from accessing your
                development environment.
              </p>
            </div>
            <p className="text-gray-700 leading-relaxed mb-4">
              Refunds will NOT be issued for:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li>Service unavailability caused by your own actions or misconfigurations</li>
              <li>Unused resources or services you provisioned but did not use</li>
              <li>Account terminations due to Terms of Service violations</li>
              <li>Change of mind or dissatisfaction with the Service</li>
              <li>Issues with your own code, applications, or configurations</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              To request a refund for legitimate platform unavailability, you
              must contact us within 7 days of the incident with details of the
              outage. We will investigate and determine eligibility based on our
              internal monitoring and logs.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              7. Service Availability
            </h2>
            <p className="text-gray-700 leading-relaxed">
              While we strive to maintain high availability, we do not guarantee
              uninterrupted access to the Service. We reserve the right to
              modify, suspend, or discontinue the Service at any time with or
              without notice. We are not liable for any interruption, downtime,
              or data loss.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              8. Limitation of Liability
            </h2>
            <p className="text-gray-700 leading-relaxed">
              To the maximum extent permitted by law, Pinacle.dev and
              InboxNarrator shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages, including but not
              limited to loss of profits, data, or other intangible losses
              resulting from your use or inability to use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              9. Modifications to Terms
            </h2>
            <p className="text-gray-700 leading-relaxed">
              We reserve the right to modify these Terms at any time. We will
              notify users of material changes via email or through the Service.
              Your continued use of the Service after such modifications
              constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              10. Governing Law
            </h2>
            <p className="text-gray-700 leading-relaxed">
              These Terms shall be governed by and construed in accordance with
              the laws of the Netherlands. Any disputes arising from these Terms
              or the Service shall be subject to the exclusive jurisdiction of
              the courts of the Netherlands.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-mono mb-4">
              11. Contact Information
            </h2>
            <p className="text-gray-700 leading-relaxed">
              If you have any questions about these Terms, please contact us
              through the Pinacle.dev website.
            </p>
          </section>

          <div className="pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Legal entity: Inbox Narrator (Netherlands)
              <br />
              Service: Pinacle.dev
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

