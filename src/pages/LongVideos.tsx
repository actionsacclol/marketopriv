import { useState } from 'react';
import { Clapperboard, Copy, Download, ExternalLink, FolderOpen, Image as ImageIcon, Sparkles, Trash2 } from 'lucide-react';
import type { LongVideo, LongStatus } from '@shared/types';
import { Card, Empty, GhostButton, Page, PrimaryButton, Section } from '../components/ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';

// Create > Long videos: the long YouTube videos (16:9, 5-20 min). The AI writes the script here (save_long_video),
// buys the narration (narrate_long_video), edits in Krypt Editor, draws the thumbnail (render_thumbnail) and uploads
// through YouTube Studio. This page shows where each one is.

const STEPS: Array<{ id: LongStatus; label: string }> = [
  { id: 'script', label: 'Script' },
  { id: 'narrated', label: 'Narrated' },
  { id: 'edited', label: 'Edited' },
  { id: 'ready', label: 'Ready' },
  { id: 'uploaded', label: 'Uploaded' },
];

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const dirOf = (p?: string): string => (p ? p.replace(/[\\/][^\\/]*$/, '') : '');

function Steps({ status }: { status: LongStatus }) {
  const at = STEPS.findIndex((s) => s.id === status);
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => (
        <span key={s.id} className={cls('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', i < at ? 'bg-white/10 text-white/60' : i === at ? 'bg-krypt-purple/25 text-white' : 'text-white/30')}>
          {s.label}
        </span>
      ))}
    </div>
  );
}

function VideoCard({ v }: { v: LongVideo }) {
  const db = useApp((s) => s.db!);
  const toast = useApp((s) => s.toast);
  const [open, setOpen] = useState(false);
  const acct = db.igAccounts.find((a) => a.id === v.accountId);
  const total = v.sections.reduce((n, s) => n + (s.seconds ?? 0), 0);
  const folder = dirOf(v.videoPath ?? v.thumbnailPath ?? v.sections.find((s) => s.audio)?.audio);
  const copy = (text: string, what: string): void => {
    void navigator.clipboard.writeText(text).then(() => toast('ok', `${what} copied.`));
  };
  return (
    <Card className="space-y-3">
      <div className="flex gap-4">
        <div className="flex h-[90px] w-[160px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
          {v.thumbnailPath ? <img src={window.marketo.app.mediaUrl(v.thumbnailPath)} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-krypt-muted" />}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="text-base font-semibold text-white">{v.title}</div>
          <div className="font-mono text-xs text-krypt-muted">
            {acct?.youtube?.channelName ?? acct?.handle ?? 'no channel'} · {v.sections.length} sections{total ? ` · ${clock(total)} narrated` : ''}
            {v.visibility ? ` · ${v.visibility}` : ''}
          </div>
          <Steps status={v.status} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {v.url && (
          <GhostButton small onClick={() => void window.marketo.app.openExternal(v.url!)}>
            <ExternalLink className="h-3.5 w-3.5" /> Open on YouTube
          </GhostButton>
        )}
        {folder && (
          <GhostButton small onClick={() => void window.marketo.app.showItemInFolder(v.videoPath ?? v.thumbnailPath ?? folder)}>
            <FolderOpen className="h-3.5 w-3.5" /> Folder
          </GhostButton>
        )}
        {v.description && (
          <GhostButton small onClick={() => copy(v.description!, 'Description')}>
            <Copy className="h-3.5 w-3.5" /> Description
          </GhostButton>
        )}
        <GhostButton small onClick={() => setOpen((x) => !x)}>
          {open ? 'Hide script' : 'Script'}
        </GhostButton>
        <GhostButton
          small
          destructive
          onClick={() => {
            if (window.confirm(`Delete "${v.title}" from the list? Its files stay in the folder.`)) void window.marketo.db.deleteLongVideo(v.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </GhostButton>
      </div>
      {open && (
        <div className="space-y-3 border-t border-white/5 pt-3">
          {v.sections.map((s, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <span className="font-mono text-xs text-krypt-muted">{i + 1}</span> {s.heading}
                {s.seconds ? <span className="font-mono text-[11px] font-normal text-krypt-muted">{clock(s.seconds)}</span> : null}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">{s.text}</p>
              {s.visual && <p className="text-xs text-krypt-muted">On screen: {s.visual}</p>}
            </div>
          ))}
          {v.description && (
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-krypt-muted">Description</div>
              <p className="whitespace-pre-wrap text-sm text-white/80">{v.description}</p>
            </div>
          )}
          {v.tags?.length ? <p className="text-xs text-krypt-muted">Tags: {v.tags.join(', ')}</p> : null}
        </div>
      )}
    </Card>
  );
}

const LENGTHS = ['5-7 minutes', '8-12 minutes', '12-20 minutes'] as const;
const EDITOR_URL = 'https://krypt.cc/tools/editor';

/** Tell Kip what video to make: he writes, narrates, presents, edits, makes the thumbnail and uploads it. */
function AskKip() {
  const db = useApp((s) => s.db!);
  const kip = useApp((s) => s.kip);
  const toast = useApp((s) => s.toast);
  const go = useApp((s) => s.go);
  const channels = db.igAccounts.filter((a) => a.youtube?.enabled);
  const [text, setText] = useState('');
  const [acct, setAcct] = useState(() => channels.find((a) => a.handle === db.settings.handle)?.id ?? channels[0]?.id ?? '');
  const [length, setLength] = useState<(typeof LENGTHS)[number]>('5-7 minutes');
  const [publicToo, setPublic] = useState(false);
  const [sending, setSending] = useState(false);
  const a = channels.find((x) => x.id === acct);
  const send = (): void => {
    const topic = text.trim();
    if (!topic || !a) return;
    if (!kip?.available) return toast('warn', kip?.reason ?? 'Kip is not set up yet: open the Kip page first.');
    if (kip.busy) return toast('warn', 'Kip is busy with something else. Send it again when he is done.');
    const say = [
      `Make a long YouTube video (${length}, 16:9) for ${a.handle}'s channel${a.youtube?.channelName ? ` "${a.youtube.channelName}"` : ''}: ${topic}`,
      'Follow the "Long videos" steps in get_overview: research and script, narration, Kip presenting every section (render_kip, moves matched to the words), the edit in Krypt Editor with plenty of motion, the thumbnail, the title and description.',
      publicToo ? 'Upload it as Public.' : 'Upload it as Unlisted, so I can watch it first.',
    ].join('\n');
    setSending(true);
    setTimeout(() => setSending(false), 4000);
    void window.marketo.kip.send(say).then(() => {
      setText('');
      toast('ok', 'Kip is on it. Follow along on the Kip page; the video shows up here as it goes.');
    });
  };
  if (!channels.length)
    return (
      <Card className="text-sm text-krypt-muted">
        Turn YouTube on for an account first (Accounts page), then Kip can make long videos for its channel.
      </Card>
    );
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Sparkles className="h-4 w-4 text-krypt-purple" /> Make one with Kip
      </div>
      <textarea
        className="input min-h-[96px] text-sm leading-relaxed"
        maxLength={1500}
        placeholder={'What is it about? e.g. "the best free Windows tweaks for gaming, end on Krypt Tweaker" or "5 settings that make your mouse feel better"'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto text-sm" value={acct} onChange={(e) => setAcct(e.target.value)}>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.youtube?.channelName ?? c.handle}
            </option>
          ))}
        </select>
        <select className="input w-auto text-sm" value={length} onChange={(e) => setLength(e.target.value as (typeof LENGTHS)[number])}>
          {LENGTHS.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <select className="input w-auto text-sm" value={publicToo ? 'public' : 'unlisted'} onChange={(e) => setPublic(e.target.value === 'public')}>
          <option value="unlisted">Unlisted first</option>
          <option value="public">Public</option>
        </select>
        <div className="flex-1" />
        <GhostButton small onClick={() => go('kip')}>
          Kip page
        </GhostButton>
        <PrimaryButton onClick={send} disabled={!text.trim() || sending || !!kip?.busy}>
          {kip?.busy ? 'Kip is busy' : 'Make it'}
        </PrimaryButton>
      </div>
      <p className="text-xs text-krypt-muted">Kip uses your ElevenLabs voice for the narration (about one credit per character) and Krypt Editor for the edit. It takes a while: most of it is rendering.</p>
    </Card>
  );
}

/** Long videos are cut in Krypt Editor: the ad for it. */
function EditorCard() {
  return (
    <Card className="space-y-2.5 border-krypt-purple/30">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Clapperboard className="h-4 w-4 text-krypt-purple" /> Long videos need Krypt Editor
      </div>
      <p className="text-sm leading-relaxed text-white/80">
        Kip edits long videos in Krypt Editor, our free video editor for Windows and macOS: chapters, key points, Kip on screen, motion on every shot, -14 LUFS export.
      </p>
      <p className="text-sm leading-relaxed text-white/80">Install it, open it, and connect it to your AI from its AI panel, the same way you connected Marketo. Keep it open while Kip works.</p>
      <PrimaryButton onClick={() => void window.marketo.app.openExternal(EDITOR_URL)}>
        <Download className="h-4 w-4" /> Get Krypt Editor
      </PrimaryButton>
    </Card>
  );
}

export default function LongVideos() {
  const list = useApp((s) => s.db!.longVideos) ?? [];
  return (
    <Page title="Long videos" subtitle="Long YouTube videos (16:9, 5-20 minutes): your AI writes the script, narrates it, edits it in Krypt Editor, makes the thumbnail and uploads it.">
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <AskKip />
          {list.length ? (
            list.map((v) => <VideoCard key={v.id} v={v} />)
          ) : (
            <Empty icon={<Clapperboard className="h-6 w-6" />} title="No long videos yet">
              Tell Kip above, or ask your AI: "make a 6 minute video on the best PC tweaks for my channel, upload it unlisted".
            </Empty>
          )}
        </div>
        <div className="space-y-4">
        <EditorCard />
        <Section title="How it works">
          <Card className="space-y-2.5 text-sm leading-relaxed text-white/80">
            <p>1. Your AI researches and writes the script, chapter by chapter, with the title, description and tags.</p>
            <p>2. It narrates it in your default voice (ElevenLabs, about one credit per character).</p>
            <p>3. Kip presents it: he talks along with the voice and acts out each part.</p>
            <p>4. It edits the video in Krypt Editor: 16:9, chapters, screen recordings, key points, motion on every shot.</p>
            <p>5. It draws the thumbnail, then uploads through YouTube Studio: unlisted unless you say public.</p>
            <p className="text-xs text-krypt-muted">Each step shows up here. Everything is saved in your render folder under "Long videos".</p>
          </Card>
        </Section>
        </div>
      </div>
    </Page>
  );
}
