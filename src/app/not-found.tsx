import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="mx-auto max-w-lg text-center">
        <Image
          src="/logo.png"
          alt="Stampiss"
          width={48}
          height={48}
          className="mx-auto mb-6"
        />
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--muted)] text-muted-foreground">
          <SearchX className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Pagina non trovata
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          La pagina che stavi cercando non esiste oppure è stata spostata.
          Prova a tornare alla home o controlla l&apos;indirizzo.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-7 text-sm font-semibold text-primary-foreground shadow-[0_14px_30px_rgba(143,93,44,0.28)] hover:bg-[#7e4f20]"
          >
            <ArrowLeft className="h-4 w-4" />
            Torna alla home
          </Link>
        </div>
      </div>
    </main>
  );
}
