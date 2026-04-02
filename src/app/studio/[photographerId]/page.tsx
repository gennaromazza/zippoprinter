import { notFound } from "next/navigation";
import { StorefrontPage } from "@/components/storefront-page";
import { getStorefrontByPhotographerId } from "@/lib/photographers";

export const dynamic = "force-dynamic";

export default async function StudioPage({
  params,
}: {
  params: Promise<{ photographerId: string }>;
}) {
  const { photographerId } = await params;
  const storefront = await getStorefrontByPhotographerId(photographerId);

  if (!storefront) {
    notFound();
  }

  return (
    <main className="min-h-screen px-4 pb-12 pt-4 md:px-8 md:pb-16 md:pt-6">
      <StorefrontPage
        photographer={storefront.photographer}
        formats={storefront.formats}
        stripeEnabled={Boolean(process.env.STRIPE_SECRET_KEY)}
      />
    </main>
  );
}
