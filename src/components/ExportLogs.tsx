import { useState } from "react";
import { FileArchive, MessageCircle } from "lucide-react";
import { KRYPT_DISCORD } from "@shared/brand";
import { Card, GhostButton, Section } from "./ui";
import { useApp } from "../state/store";

/** Setup > Help: the logs in one zip, to send to Krypt when something goes wrong. */
export function ExportLogsSection() {
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const run = async (): Promise<void> => {
    setBusy(true);
    try {
      const r = await window.marketo.app.exportLogs();
      if (!r.ok)
        return toast("error", r.message ?? "Could not export the logs.");
      if (r.data)
        toast(
          "ok",
          `Logs saved (${Math.max(1, Math.round(r.data.bytes / 1024))} KB). Send that zip in the Krypt Discord.`,
        );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section
      title="Help"
      description="Something not working? Export the logs and send the zip to Krypt in the Discord, with a line on what happened and when."
    >
      <Card className="space-y-3">
        <p className="text-[11px] leading-relaxed text-krypt-muted">
          One zip with Marketo's log, the last 20 autopilot runs and a short
          sheet about this computer and its setup. Never your keys, passwords,
          database or reels; emails and your Windows user name are blanked out.
        </p>
        <div className="flex flex-wrap gap-2">
          <GhostButton small onClick={() => void run()} disabled={busy}>
            <FileArchive className="h-3.5 w-3.5" />{" "}
            {busy ? "Exporting…" : "Export logs"}
          </GhostButton>
          <GhostButton
            small
            onClick={() => void window.marketo.app.openExternal(KRYPT_DISCORD)}
          >
            <MessageCircle className="h-3.5 w-3.5" /> Discord
          </GhostButton>
        </div>
      </Card>
    </Section>
  );
}
