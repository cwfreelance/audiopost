import { notFound } from "next/navigation";
import { Suspense } from "react";
import { parseUsername } from "@/lib/username";
import { Blog } from "./blog";

type Props = PageProps<"/[username]">;

export default function BlogPage({ params }: Props) {
  return (
    // Cache Components: params are runtime data, so read them inside Suspense.
    <Suspense>
      <BlogView params={params} />
    </Suspense>
  );
}

// An invalid username shows the not-found page without calling the posts API.
async function BlogView({ params }: Pick<Props, "params">) {
  const username = parseUsername((await params).username) ?? notFound();
  return <Blog key={username} username={username} />;
}
