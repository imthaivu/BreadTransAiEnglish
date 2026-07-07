"use client";

import PageMotion from "@/components/ui/PageMotion";
import { RequireAuth } from "@/lib/auth/guard";
import { AiHubScreen } from "@/modules/ai/components/AiHubScreen";

export default function AiPage() {
  return (
    <RequireAuth>
      <PageMotion>
        <AiHubScreen />
      </PageMotion>
    </RequireAuth>
  );
}
