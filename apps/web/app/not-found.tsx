import Link from "next/link";
import type { Route } from "next";

import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";

export default function NotFound() {
  return (
    <div className="grid min-h-[40vh] place-items-center py-12">
      <Card className="max-w-md text-center">
        <CardTitle className="text-3xl">We could not find that page.</CardTitle>
        <CardDescription>
          The remembrance you were looking for may have moved, or the link may
          have a typo.
        </CardDescription>
        <div className="mt-4 flex justify-center gap-2">
          <Link href={"/" as Route}>
            <Button variant="outline">Go home</Button>
          </Link>
          <Link href={"/upload" as Route}>
            <Button>Build a remembrance</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
