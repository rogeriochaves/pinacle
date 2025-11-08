import type { MDXComponents } from "mdx/types";

export const useMDXComponents = (components: MDXComponents): MDXComponents => {
  return {
    h1: ({ children }) => (
      <h1 className="text-4xl font-bold font-mono tracking-tight mb-6 mt-8">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-3xl font-bold font-mono tracking-tight mb-4 mt-8">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-2xl font-bold font-mono tracking-tight mb-3 mt-6">
        {children}
      </h3>
    ),
    p: ({ children }) => <p className="mb-4 leading-7 text-gray-700">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-2">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-2">{children}</ol>,
    li: ({ children }) => <li className="leading-7 text-gray-700">{children}</li>,
    a: ({ href, children }) => (
      <a
        href={href}
        className="text-orange-600 hover:text-orange-700 underline"
        target={href?.startsWith("http") ? "_blank" : undefined}
        rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
      >
        {children}
      </a>
    ),
    code: ({ children }) => (
      <code className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 font-mono text-sm text-gray-900">
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre className="bg-gray-900 text-gray-100 rounded-sm border-2 border-gray-700 p-4 overflow-x-auto mb-4 font-mono text-sm">
        {children}
      </pre>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-orange-500 pl-4 italic my-4 text-gray-600">
        {children}
      </blockquote>
    ),
    ...components,
  };
};


