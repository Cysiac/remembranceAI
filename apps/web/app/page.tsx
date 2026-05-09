import Link from "next/link";
import type { Route } from "next";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";

const PILLARS: Array<{ title: string; body: string }> = [
  {
    title: "Their words",
    body: "Upload letters, emails, texts, and journals. We learn how they wrote.",
  },
  {
    title: "Their voice",
    body: "Drop in a minute or two of clean audio and we clone their voice with care.",
  },
  {
    title: "Their stories",
    body: "Chat in their voice and generate short memorial videos for the moments you missed.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col gap-16 py-8 sm:py-14 animate-fade-in">
      <section className="grid gap-10 sm:gap-14 sm:grid-cols-12">
        <div className="sm:col-span-7 flex flex-col gap-6">
          <Badge tone="gold" className="self-start uppercase tracking-[0.2em]">
            In Loving Memory
          </Badge>
          <h1 className="font-serif text-5xl leading-tight text-ink sm:text-6xl">
            Talk with the people you miss most.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-ink-soft">
            Memorial AI gathers the words, voice, and photographs your loved one
            left behind and weaves them into a gentle remembrance you can call up
            whenever you need to hear them again.
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link href={"/upload" as Route}>
              <Button size="lg" aria-label="Create a remembrance">
                Create a remembrance
              </Button>
            </Link>
            <Link href={"/persona/demo?demo=1" as Route}>
              <Button size="lg" variant="outline" aria-label="Try the demo">
                Try the Grandma demo
              </Button>
            </Link>
          </div>

          <p className="pt-2 text-xs text-ink-muted">
            Memorial AI never claims to be the real person. Everything is an
            interpretation built from material you choose to share.
          </p>
        </div>

        <div className="sm:col-span-5">
          <Card className="bg-gradient-to-br from-parchment-50 to-parchment-100">
            <CardTitle className="text-3xl">A small ritual</CardTitle>
            <CardDescription className="text-base text-ink-soft">
              Upload, wait a few minutes, then sit with someone you love.
            </CardDescription>
            <CardContent className="mt-4">
              <ol className="space-y-3 text-sm text-ink">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-gold-200 font-serif text-sm text-gold-800">
                    1
                  </span>
                  <span>
                    Bring their words. Letters, emails, texts, journals, anything
                    that sounded like them.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-gold-200 font-serif text-sm text-gold-800">
                    2
                  </span>
                  <span>
                    Add a clean voice clip and a favourite photograph if you have
                    one.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-gold-200 font-serif text-sm text-gold-800">
                    3
                  </span>
                  <span>
                    Open the remembrance, ask them about the lake house, and give
                    yourself a moment.
                  </span>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {PILLARS.map((pillar) => (
          <Card key={pillar.title} className="bg-white/60">
            <CardTitle className="text-xl">{pillar.title}</CardTitle>
            <p className="mt-2 text-sm text-ink-soft">{pillar.body}</p>
          </Card>
        ))}
      </section>

      <section className="flex flex-col items-center gap-3 text-center">
        <h2 className="font-serif text-3xl text-ink">Built with care</h2>
        <p className="max-w-2xl text-sm text-ink-soft">
          Your uploads are stored privately. The persona is yours. You can revisit,
          rebuild, or step away whenever you need to.
        </p>
      </section>
    </div>
  );
}
