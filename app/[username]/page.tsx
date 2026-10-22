import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { UsernameForm } from "@/app/username-form";
import { parseUsername } from "@/lib/username";

type Props = PageProps<"/[username]">;

export default function BlogPage({ params }: Props) {
  return (
    <>
      <header>
        <Link href="/">audiopost</Link>
        <UsernameForm />
      </header>
      <main>
        {/* Cache Components: params are runtime data, so read them inside Suspense. */}
        <Suspense>
          <BlogHeading params={params} />
        </Suspense>
      </main>
    </>
  );
}

async function BlogHeading({ params }: Pick<Props, "params">) {
  const username = parseUsername((await params).username) ?? notFound();
  return <h1>@{username}</h1>;
}
