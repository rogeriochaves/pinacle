import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { useMDXComponents } from "@/lib/blog/mdx-components";
import { getAllPosts, getPostBySlug } from "@/lib/blog/mdx";
import { MDXRemote } from "next-mdx-remote/rsc";
import Link from "next/link";
import { notFound } from "next/navigation";

type BlogPostPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export const generateStaticParams = async () => {
  const posts = getAllPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
};

export const generateMetadata = async ({ params }: BlogPostPageProps) => {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {
      title: "Post not found",
    };
  }

  return {
    title: `${post.title} - Pinacle Blog`,
    description: post.description,
  };
};

async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const components = useMDXComponents({});

  return (
    <div className="min-h-screen bg-white">
      {/* Dark header section */}
      <section className="relative bg-gray-900 py-6 px-6 lg:px-8 text-background">
        <div className="mx-auto max-w-7xl flex flex-col gap-10">
          <Header />

          <div className="flex flex-col gap-8 pt-16 pb-12">
            <div className="max-w-3xl mx-auto">
              <Link
                href="/blog"
                className="text-gray-300 hover:text-white font-mono text-sm mb-6 inline-block"
              >
                ← Back to blog
              </Link>

              <h1 className="text-4xl font-bold font-mono tracking-tight mb-4">
                {post.title}
              </h1>

              <div className="flex items-center gap-3 text-sm text-gray-300 font-mono">
                <time dateTime={post.date}>{formatDate(post.date)}</time>
                <span>·</span>
                <span>{post.author}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Light content section */}
      <section className="relative bg-slate-100 py-12 px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <article className="prose prose-lg max-w-none bg-white border-2 border-gray-300 rounded-sm p-8 shadow-sm">
            <MDXRemote source={post.content} components={components} />
          </article>
        </div>
      </section>

      <Footer />
    </div>
  );
}

export default BlogPostPage;


