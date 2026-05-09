"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import {
  readSavedRememberances,
  type SavedRememberance,
} from "@/components/savedRememberanceStorage";

type HomeTab = "create" | "saved";

export function HomeRememberanceTabs() {
  const [activeTab, setActiveTab] = useState<HomeTab>("saved");
  const [saved, setSaved] = useState<SavedRememberance[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    setSaved(readSavedRememberances());
    setHasLoaded(true);
  }, []);

  const savedLabel = hasLoaded
    ? `Saved rememberances (${saved.length})`
    : "Saved rememberances";

  return (
    <section className="flex flex-col gap-4" aria-label="Homepage rememberance tabs">
      <div
        role="tablist"
        aria-label="Rememberance homepage sections"
        className="inline-flex w-full flex-col rounded-2xl border border-parchment-200 bg-white/60 p-1 shadow-soft sm:w-auto sm:flex-row"
      >
        <TabButton
          id="home-tab-create"
          active={activeTab === "create"}
          controls="home-panel-create"
          onClick={() => setActiveTab("create")}
        >
          Start a new rememberance
        </TabButton>
        <TabButton
          id="home-tab-saved"
          active={activeTab === "saved"}
          controls="home-panel-saved"
          onClick={() => setActiveTab("saved")}
        >
          {savedLabel}
        </TabButton>
      </div>

      {activeTab === "create" ? (
        <Card
          id="home-panel-create"
          role="tabpanel"
          aria-labelledby="home-tab-create"
          className="bg-parchment-50"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <CardTitle className="text-2xl">Begin with their story</CardTitle>
              <CardDescription className="mt-2 text-sm leading-relaxed">
                Create a rememberance from letters, messages, voice clips, and
                photographs. When it is created, this browser will keep a quick
                link back here.
              </CardDescription>
            </div>
            <Link href={"/upload" as Route}>
              <Button size="lg">Create a rememberance</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <Card
          id="home-panel-saved"
          role="tabpanel"
          aria-labelledby="home-tab-saved"
          className="bg-white/70"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-2xl">Previously saved rememberances</CardTitle>
              <CardDescription className="mt-1">
                Quick links saved in this browser after you create a rememberance.
              </CardDescription>
            </div>
            <Badge tone="gold">{saved.length} saved</Badge>
          </div>

          {saved.length > 0 ? (
            <ul className="mt-5 grid gap-3">
              {saved.map((item) => (
                <li
                  key={item.personaId}
                  className="rounded-2xl border border-parchment-200 bg-parchment-50 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <Link
                        href={`/persona/${item.personaId}` as Route}
                        className="font-serif text-2xl font-semibold text-ink hover:text-gold-700"
                      >
                        {item.name}
                      </Link>
                      <p className="mt-1 text-sm text-ink-muted">
                        your {item.relationship}
                      </p>
                      {item.note ? (
                        <p className="mt-3 line-clamp-2 text-sm text-ink-soft">
                          {item.note}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-2 text-left sm:items-end sm:text-right">
                      <span className="text-xs uppercase tracking-[0.14em] text-ink-muted">
                        Saved {formatSavedDate(item.createdAt)}
                      </span>
                      <Link
                        href={`/persona/${item.personaId}` as Route}
                        className="text-sm font-medium text-gold-700 underline-offset-4 hover:underline"
                      >
                        Open rememberance
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-parchment-300 bg-parchment-50 p-5">
              <CardTitle className="text-xl">No saved rememberances yet</CardTitle>
              <CardDescription className="mt-2">
                Once you create one, we will save its name and link locally in
                this browser so you can return to it from the homepage.
              </CardDescription>
              <Link href={"/upload" as Route} className="mt-4 inline-flex">
                <Button>Create the first rememberance</Button>
              </Link>
            </div>
          )}
        </Card>
      )}
    </section>
  );
}

interface TabButtonProps {
  id: string;
  active: boolean;
  controls: string;
  children: React.ReactNode;
  onClick: () => void;
}

function TabButton({ id, active, controls, children, onClick }: TabButtonProps) {
  return (
    <button
      id={id}
      role="tab"
      type="button"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={cn(
        "rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300",
        active
          ? "bg-gold-500 text-white shadow-soft"
          : "text-ink-soft hover:bg-parchment-100 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function formatSavedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}
