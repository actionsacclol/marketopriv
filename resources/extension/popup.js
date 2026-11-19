'use strict';
const $ = (id) => document.getElementById(id);
let paused = false;

function show(s) {
  if (!s) return;
  paused = !!s.stopped;
  $('hubDot').className = `dot ${s.hubUp ? 'ok' : 'warn'}`;
  $('hub').textContent = s.hubUp
    ? 'Connected to Krypt Marketo on this computer.'
    : /not found/i.test(s.hostError || '')
      ? 'Krypt Marketo is not set up on this computer. Install it and open it once.'
      : 'Krypt Marketo is not running. Open it and this connects by itself.';
  $('igDot').className = `dot ${s.loggedIn ? 'ok' : 'warn'}`;
  $('ig').textContent = s.loggedIn ? 'Instagram is signed in in this profile.' : 'Instagram is not signed in in this profile. Sign in at instagram.com as usual.';
  $('xDot').className = `dot ${s.xLoggedIn ? 'ok' : ''}`;
  $('x').textContent = s.xLoggedIn ? 'X is signed in in this profile.' : 'X is not signed in here (only needed if Marketo runs an X profile).';
  for (const [id, key, label] of [['fb', 'facebook', 'Facebook'], ['th', 'threads', 'Threads'], ['pin', 'pinterest', 'Pinterest']]) {
    const on = !!(s.nets && s.nets[key] && s.nets[key].loggedIn);
    $(`${id}Dot`).className = `dot ${on ? 'ok' : ''}`;
    $(id).textContent = on ? `${label} is signed in in this profile.` : `${label} is not signed in here (only needed if Marketo runs a ${label} profile).`;
  }
  $('ttDot').className = `dot ${s.ttLoggedIn ? 'ok' : ''}`;
  $('tt').textContent = s.ttLoggedIn ? 'TikTok is signed in in this profile.' : 'TikTok is not signed in here (only needed if Marketo runs a TikTok profile).';
  $('ytDot').className = `dot ${s.ytLoggedIn ? 'ok' : ''}`;
  $('yt').textContent = s.ytLoggedIn ? 'YouTube is signed in in this profile (for uploading Shorts).' : 'YouTube is not signed in here (only needed for uploading Shorts).';
  $('pause').textContent = paused ? 'Resume AI control' : 'Pause AI control for 5 minutes';
  $('prefer').disabled = !s.hubUp;
}

const ask = (type) => chrome.runtime.sendMessage({ type }).then(show, () => {});

$('prefer').addEventListener('click', () => {
  void ask('prefer').then(() => {
    $('note').textContent = 'Marketo will use this profile for accounts it has not matched yet.';
  });
});
$('pause').addEventListener('click', () => void ask(paused ? 'resume' : 'pause'));
void ask('connect');
setInterval(() => void ask('status'), 1500);
