import Link from "next/link";
import { Suspense } from "react";
import { UsernameForm } from "@/app/username-form";

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
          <Username params={params} />
        </Suspense>
      </main>
    </>
  );
}

async function Username({ params }: Pick<Props, "params">) {
  const { username } = await params;
  return <h1>@{username}</h1>;
}
