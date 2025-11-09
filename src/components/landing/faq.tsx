import Link from "next/link";

type FAQItem = {
  question: string;
  answer: React.ReactNode;
};

const faqs: FAQItem[] = [
  {
    question: "How does Pinacle work?",
    answer: (
      <>
        Pinacle provides instant development environments that run in your
        browser. Simply connect your GitHub repository, choose your stack, and
        start coding within seconds.
        <br />
        <br />
        Each environment includes your choice of tools like VS Code, Claude Code or Cursor CLI,
        a terminal, and more, all pre-configured and ready to use.
      </>
    ),
  },
  {
    question: "Is it for me?",
    answer: (
      <>
        If you're using tools like Lovable, v0, or Bolt and hitting their
        limitations, Pinacle gives you real development tools without the setup
        hassle.
        <br />
        <br />
        Already a developer? Pinacle helps you work on multiple projects
        simultaneously without cluttering your local machine. Each project gets
        its own clean environment with everything configured and ready.
        <br />
        <br />
        When you need to jump back into a project from two weeks ago, it's still
        there, running and ready, exactly how you left it.
      </>
    ),
  },
  {
    question: "What is included in a pod?",
    answer:
      "Each pod includes a full Linux environment with root access, your choice of coding tools (VS Code, Claude Code, Cursor CLI), web terminal, project management with Vibe Kanban, git integration, and support for any programming language or framework. All tools run in your browser with no local installation needed.",
  },
  {
    question: "Is my data protected?",
    answer: (
      <>
        Yes. Your code and data remain private and secure. Each pod runs in a
        completely isolated and sandboxed container.
        <br />
        <br />
        We use industry-standard encryption for data in transit and at rest. Your
        GitHub credentials are securely stored and never shared.
      </>
    ),
  },
  {
    question: "Can I use this with my private GitHub repositories?",
    answer:
      "Absolutely! Pinacle integrates seamlessly with GitHub. You can clone existing repositories or create new ones directly from the setup flow. We use GitHub Apps for secure authentication and support both personal and organization repositories.",
  },
  {
    question: "How does billing work?",
    answer: (
      <>
        Pinacle charges based on usage time and resource tier. You only pay for
        the time your pods are running. You can start, stop, and delete pods at
        any time.
        <br />
        <br />
        We offer different tiers (small, medium, large, xlarge) to match your
        project needs. See our pricing page for detailed rates.
      </>
    ),
  },
  {
    question: "Can I install any dependencies?",
    answer:
      "Yes! You have full root access in your pod. Install any packages, dependencies, or tools you need using apk, pnpm, npm, uv, or any other package manager. Your install commands can be saved in your pinacle.yaml for automatic setup on new pods.",
  },
  {
    question: "What happens to my work when I stop a pod?",
    answer: (
      <>
        We create automatic snapshots of your pod's state once you stop it, so you can
        restore it later. Snapshots incur a small storage cost, but you can delete them at any time.
        <br />
        <br />
        Should you delete the pod and snapshot, committed changes remain of course safely stored on GitHub, along with a pinacle.yaml file that
        allows you to recreate your pod's environment later.
      </>
    ),
  },
  {
    question: "Can I run multiple services?",
    answer:
      "Yes! Pinacle supports running multiple services and processes simultaneously. Start your frontend, backend, database, and any other services you need. Each gets its own port, and you can access them all through our built-in proxy.",
  },
  {
    question: "Do I need to configure anything?",
    answer: (
      <>
        Not for most projects! Pinacle automatically detects your project type
        and configures everything for you.
        <br />
        <br />
        For advanced customization, you can use pinacle.yaml to define services,
        processes, environment variables, and startup commands.
      </>
    ),
  },
];

export const FAQ = () => {
  return (
    <section className="bg-gray-50 py-16 sm:py-24 border-b border-gray-200">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold font-mono tracking-tight text-foreground sm:text-3xl">
            Frequently asked questions
          </h2>
          <p className="mt-4 text-base text-muted-foreground font-mono">
            If you have anything else you want to ask,{" "}
            <Link
              href="mailto:hello@pinacle.dev"
              className="text-orange-600 hover:text-orange-700 underline"
            >
              reach out to us
            </Link>
            .
          </p>
        </div>

        {/* FAQ Columns - fluid masonry layout */}
        <div className="columns-1 md:columns-2 lg:columns-3 gap-8 space-y-8">
          {faqs.map((faq) => (
            <div key={faq.question} className="break-inside-avoid mb-8">
              <h3 className="text-base font-bold font-mono text-foreground mb-3">
                {faq.question}
              </h3>
              <div className="text-sm text-muted-foreground font-mono leading-relaxed">
                {faq.answer}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

