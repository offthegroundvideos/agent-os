// HTML for the public pages a prospect sees (/p/<token>). Plain server-rendered HTML with inline CSS:
// no app JavaScript, no dashboard data, nothing indexed.

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const safeUrl = (url) => (/^https:\/\//i.test(String(url ?? '')) ? escapeHtml(url) : '');

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#05060d;color:#e6edf6;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.55;
  background-image:radial-gradient(60vw 40vh at 85% -10%,rgba(167,139,250,.18),transparent 70%),radial-gradient(60vw 50vh at -10% 20%,rgba(34,211,238,.12),transparent 70%);min-height:100vh}
main{max-width:760px;margin:0 auto;padding:28px 18px 64px}
.brand{font-weight:800;letter-spacing:.18em;font-size:12px;color:#67e8f9;text-transform:uppercase}
h1{font-size:clamp(28px,6vw,44px);line-height:1.1;margin:10px 0 14px;font-weight:800;letter-spacing:-.01em}
h2{font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#67e8f9;margin:34px 0 12px}
p.lead{font-size:18px;color:#cbd5e1}
.panel{border:1px solid rgba(103,232,249,.18);background:rgba(15,23,42,.55);border-radius:18px;padding:16px}
video{width:100%;border-radius:14px;background:#000;display:block}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.work{display:block;text-decoration:none;color:inherit;border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden;background:rgba(2,6,23,.6)}
.work img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#0b1020}
.work div{padding:10px 12px;font-size:14px}
.work small{display:block;color:#94a3b8;margin-top:2px}
.cta{display:inline-block;margin-top:8px;background:linear-gradient(90deg,#22d3ee,#a78bfa);color:#04131a;font-weight:800;text-decoration:none;
  padding:14px 22px;border-radius:14px;letter-spacing:.02em;border:0;font-size:16px;cursor:pointer}
.muted{color:#94a3b8;font-size:14px}
.day{margin-top:14px}
.day h3{font-size:14px;color:#cbd5e1;margin-bottom:8px}
.slots{display:flex;flex-wrap:wrap;gap:8px}
.slots label{position:relative}
.slots input{position:absolute;opacity:0}
.slots span{display:inline-block;padding:9px 12px;border-radius:10px;border:1px solid rgba(103,232,249,.25);font-size:14px;cursor:pointer}
.slots input:checked+span{background:rgba(34,211,238,.2);border-color:#67e8f9;color:#fff}
.slots input:focus-visible+span{outline:2px solid #a78bfa}
.field{display:block;margin-top:12px;font-size:14px;color:#cbd5e1}
.field input,.field textarea{display:block;width:100%;margin-top:6px;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.12);
  background:rgba(2,6,23,.7);color:#fff;font-size:16px;font-family:inherit}
.error{border:1px solid rgba(251,113,133,.5);background:rgba(244,63,94,.1);color:#fecdd3;padding:10px 12px;border-radius:12px;margin-top:12px}
footer{margin-top:48px;color:#64748b;font-size:12px}
a{color:#67e8f9}
`;

export function layout(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title><style>${CSS}</style></head><body><main>${body}
<footer>OFF THE GROUND · photo, video and drone · Fairfax, California · <a href="https://madebyotg.com">madebyotg.com</a></footer>
</main></body></html>`;
}

export function renderLeadPage(page) {
  const first = String(page.senderName || 'Jack').split(' ')[0];
  const video = page.video ? `
<h2>A quick hello</h2>
<div class="panel"><video controls playsinline preload="metadata" id="clip" src="/p/${escapeHtml(page.token)}/video/${page.video.id}"></video></div>
<script>(function(){var v=document.getElementById('clip');var sent=false;v.addEventListener('play',function(){if(sent)return;sent=true;
try{navigator.sendBeacon('/p/${escapeHtml(page.token)}/play')}catch(e){}});})();</script>` : '';
  const pieces = page.pieces.length ? `
<h2>Work that fits</h2>
<div class="grid">${page.pieces.map((piece) => `
<a class="work" href="${safeUrl(piece.url)}" target="_blank" rel="noopener">${piece.thumbnailUrl && safeUrl(piece.thumbnailUrl) ? `<img src="${safeUrl(piece.thumbnailUrl)}" alt="" loading="lazy">` : ''}
<div>${escapeHtml(piece.title)}${piece.description ? `<small>${escapeHtml(String(piece.description).slice(0, 110))}</small>` : ''}</div></a>`).join('')}
</div>` : '';
  return layout(`For ${page.business} · OFF THE GROUND`, `
<div class="brand">Off the Ground</div>
<h1>Hi ${escapeHtml(page.business)}.</h1>
<p class="lead">${escapeHtml(page.intro)}</p>
${video}
${pieces}
<h2>Let's talk</h2>
<div class="panel">
<p>A free 20-minute call with ${escapeHtml(first)} about what you have coming up. No pitch deck, no pressure.</p>
<a class="cta" href="/p/${escapeHtml(page.token)}/book">Book a free 20-minute call</a>
</div>`);
}

export function renderBooking(page, slots, { error = '', values = {}, label = (iso) => iso } = {}) {
  const days = new Map();
  for (const iso of slots) {
    const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(iso));
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(iso);
  }
  const time = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const picker = days.size ? [...days.entries()].map(([day, list]) => `
<div class="day"><h3>${escapeHtml(day)}</h3><div class="slots">${list.map((iso) => `
<label><input type="radio" name="start" value="${escapeHtml(iso)}" required${values.start === iso ? ' checked' : ''}><span>${escapeHtml(time(iso))}</span></label>`).join('')}
</div></div>`).join('') : '<p class="muted">No open times in the next two weeks. Reply to our email and we will find one.</p>';
  return layout(`Book a call · OFF THE GROUND`, `
<div class="brand">Off the Ground</div>
<h1>Pick a time</h1>
<p class="lead">A free 20-minute video call about ${escapeHtml(page.business)}. Times are Pacific (California).</p>
${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
<form method="post" action="/p/${escapeHtml(page.token)}/book">
<div class="panel" style="margin-top:18px">${picker}</div>
${days.size ? `<div class="panel" style="margin-top:14px">
<label class="field">Your name<input name="name" autocomplete="name" maxlength="80" required value="${escapeHtml(values.name ?? '')}"></label>
<label class="field">Email for the invite<input name="email" type="email" autocomplete="email" maxlength="160" required value="${escapeHtml(values.email ?? '')}"></label>
<label class="field">Anything we should know? (optional)<textarea name="note" rows="3" maxlength="500">${escapeHtml(values.note ?? '')}</textarea></label>
<input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
<button class="cta" type="submit" style="margin-top:16px">Book the call</button>
</div>` : ''}
</form>
<p class="muted" style="margin-top:14px"><a href="/p/${escapeHtml(page.token)}">← Back</a></p>`);
}

export function renderBooked(page, result) {
  return layout('You are booked · OFF THE GROUND', `
<div class="brand">Off the Ground</div>
<h1>You're booked.</h1>
<p class="lead">${escapeHtml(result.label)} with ${escapeHtml(result.closer)}. ${result.onCalendar ? 'A calendar invite with a video link is on its way to your inbox.' : 'We will email you the details shortly.'}</p>
<div class="panel" style="margin-top:18px"><p>Talk soon. If something comes up, just reply to our email.</p></div>
<p class="muted" style="margin-top:14px"><a href="/p/${escapeHtml(page.token)}">← Back to your page</a></p>`);
}

export function renderGone() {
  return layout('OFF THE GROUND', `<div class="brand">Off the Ground</div><h1>This page isn't available.</h1>
<p class="lead">It may have expired. Visit <a href="https://madebyotg.com">madebyotg.com</a> or reply to our email.</p>`);
}

export function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; img-src https: data:; media-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}
