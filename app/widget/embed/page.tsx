"use client";

import { useEffect } from "react";
import { ChatWidget } from "@/components/chat";

interface EmbedPageProps {
  searchParams?: {
    dealershipId?: string;
    position?: string;
    name?: string;
  };
}

export default function WidgetEmbedPage({ searchParams }: EmbedPageProps) {
  const dealershipId = searchParams?.dealershipId ?? "demo-dealer";
  const dealershipName =
    searchParams?.name?.trim() || `Dealer ${dealershipId.slice(0, 6)}`;
  const positionParam =
    searchParams?.position === "bottom-left" ? "bottom-left" : "bottom-right";

  useEffect(() => {
    const originalBackground = document.body.style.background;
    const originalMargin = document.body.style.margin;
    const originalOverflow = document.body.style.overflow;

    document.body.style.background = "transparent";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.background = originalBackground;
      document.body.style.margin = originalMargin;
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-transparent">
      <ChatWidget
        dealershipName={dealershipName}
        dealershipId={dealershipId}
        position={positionParam}
      />
    </div>
  );
}

