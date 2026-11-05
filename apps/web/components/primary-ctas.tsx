import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DoorOpen, PartyPopper } from "lucide-react";
import { Badge, Button, cn } from "@happyroom/ui";
import { features } from "@/lib/features";

/**
 * Primary landing CTAs. Until the create/join flows ship (Milestone 2) they render as clearly
 * labelled, non-navigating controls with an explanation — never as links to dead pages.
 */
export async function PrimaryCtas({ className, id }: { className?: string; id: string }) {
  const t = await getTranslations("common");
  const hintId = `${id}-hint`;
  const anyDisabled = !features.createRoom || !features.joinRoom;
  const centered = className?.includes("items-center");

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className={cn("flex flex-wrap gap-3", centered && "justify-center")}>
        {features.createRoom ? (
          <Button asChild size="lg">
            <Link href="/create" data-testid="cta-create">
              <PartyPopper aria-hidden /> {t("createRoom")}
            </Link>
          </Button>
        ) : (
          <Button size="lg" aria-disabled="true" aria-describedby={hintId} data-testid="cta-create">
            <PartyPopper aria-hidden /> {t("createRoom")}
          </Button>
        )}
        {features.joinRoom ? (
          <Button asChild size="lg" variant="secondary">
            <Link href="/join" data-testid="cta-join">
              <DoorOpen aria-hidden /> {t("joinRoom")}
            </Link>
          </Button>
        ) : (
          <Button
            size="lg"
            variant="secondary"
            aria-disabled="true"
            aria-describedby={hintId}
            data-testid="cta-join"
          >
            <DoorOpen aria-hidden /> {t("joinRoom")}
          </Button>
        )}
      </div>
      {anyDisabled && (
        <p
          id={hintId}
          className={cn(
            "flex max-w-md flex-wrap items-center gap-2 text-sm text-ink-muted",
            centered && "justify-center text-center",
          )}
        >
          <Badge tone="gold">{t("comingSoon")}</Badge>
          <span>{t("comingSoonHint")}</span>
        </p>
      )}
    </div>
  );
}
