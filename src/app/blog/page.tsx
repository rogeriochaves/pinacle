import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { getAllPosts } from "@/lib/blog/mdx";
import Link from "next/link";

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

function BlogPage() {
  const posts = getAllPosts();

  return (
    <div className="min-h-screen bg-white">
      {/* Dark header section */}
      <section className="relative bg-gray-900 py-6 px-6 lg:px-8 text-background">
        <div className="mx-auto max-w-7xl flex flex-col gap-10">
          <Header />

          <div className="flex flex-col gap-8 pt-16 pb-12">
            <div className="text-center max-w-3xl mx-auto">
              <h1 className="text-4xl font-bold font-mono tracking-tight mb-4">
                Blog
              </h1>
              <p className="text-lg text-gray-300">
                Updates, thoughts, and technical deep dives on building better
                development environments.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Light content section */}
      <section className="relative bg-slate-100 py-12 px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          {posts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 font-mono">No posts yet. Check back soon.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {posts.map((post) => (
                <article
                  key={post.slug}
                  className="border-2 border-gray-300 rounded-sm bg-white p-6 hover:border-gray-400 transition-colors shadow-sm"
                >
                  <Link href={`/blog/${post.slug}`}>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-sm text-gray-600 font-mono">
                        <time dateTime={post.date}>{formatDate(post.date)}</time>
                        <span>·</span>
                        <span>{post.author}</span>
                      </div>

                      <h2 className="text-2xl font-bold font-mono tracking-tight text-gray-900 hover:text-orange-600 transition-colors">
                        {post.title}
                      </h2>

                      <p className="text-gray-700 leading-relaxed">
                        {post.description}
                      </p>

                      <div className="pt-2">
                        <span className="text-orange-600 font-mono text-sm hover:text-orange-700">
                          Read more →
                        </span>
                      </div>
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

export default BlogPage;


