"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

type Suggestion = { id: string; business_name: string | null; city: string | null; state: string | null };
type Phase = "search" | "confirm" | "locating" | "found";

const LOCATING_STEPS = [
  "Locating your build…",
  "Loading your design…",
  "Rendering your preview…",
  "Almost there…",
];

function placeOf(s: { city: string | null; state: string | null }) {
  return [s.city, s.state].filter(Boolean).join(", ");
}

export function FindYourSite() {
  const rootRef = useRef<HTMLDivElement>(null);
  const orbsRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>("search");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [zip, setZip] = useState("");
  const [zipError, setZipError] = useState(false);
  const [foundName, setFoundName] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(0);

  const reduceMotion = useRef(false);

  // ----- atmosphere + hero entrance (failure-safe: content is visible by
  // default; gsap.from animates INTO the resting state) -----
  useEffect(() => {
    reduceMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = gsap.context(() => {
      if (!reduceMotion.current) {
        const orbs = orbsRef.current?.children;
        if (orbs) {
          Array.from(orbs).forEach((orb, i) => {
            gsap.to(orb, {
              xPercent: i % 2 === 0 ? 14 : -12,
              yPercent: i % 2 === 0 ? -10 : 12,
              scale: 1.12,
              duration: 9 + i * 2.5,
              repeat: -1,
              yoyo: true,
              ease: "sine.inOut",
            });
          });
        }
        gsap.from("[data-enter]", {
          y: 22,
          opacity: 0,
          duration: 0.7,
          ease: "power3.out",
          stagger: 0.08,
          delay: 0.05,
        });
      }
    }, rootRef);
    return () => ctx.revert();
  }, []);

  // ----- debounced name typeahead (search phase only) -----
  useEffect(() => {
    if (phase !== "search") return;
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/templates/find", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ business_name: q }),
          signal: ctrl.signal,
        });
        const j = (await r.json()) as { suggestions?: Suggestion[] };
        setSuggestions(Array.isArray(j.suggestions) ? j.suggestions : []);
      } catch {
        /* aborted or network — ignore */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, phase]);

  // ----- animate suggestion list in as it changes -----
  useEffect(() => {
    if (reduceMotion.current || phase !== "search" || suggestions.length === 0) return;
    const items = listRef.current?.querySelectorAll("[data-suggestion]");
    if (items && items.length) {
      gsap.fromTo(
        items,
        { y: 10, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4, ease: "power2.out", stagger: 0.05 },
      );
    }
  }, [suggestions, phase]);

  // ----- animate the active panel (confirm / found) in -----
  useEffect(() => {
    if (reduceMotion.current) return;
    if ((phase === "confirm" || phase === "found") && panelRef.current) {
      gsap.fromTo(
        panelRef.current,
        { y: 18, opacity: 0, scale: 0.98 },
        { y: 0, opacity: 1, scale: 1, duration: 0.55, ease: "power3.out" },
      );
      if (phase === "found") {
        gsap.fromTo(
          panelRef.current.querySelectorAll("[data-pop]"),
          { scale: 0.6, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.7, ease: "back.out(2)", stagger: 0.08, delay: 0.1 },
        );
        const dots = panelRef.current.querySelectorAll("[data-spark]");
        dots.forEach((d, i) => {
          const ang = (i / dots.length) * Math.PI * 2;
          gsap.fromTo(
            d,
            { x: 0, y: 0, opacity: 1, scale: 1 },
            {
              x: Math.cos(ang) * 120,
              y: Math.sin(ang) * 120,
              opacity: 0,
              scale: 0.2,
              duration: 1.0,
              ease: "power2.out",
              delay: 0.15,
            },
          );
        });
      }
    }
  }, [phase]);

  // ----- locating status text cycling -----
  useEffect(() => {
    if (phase !== "locating") return;
    setStepIdx(0);
    const iv = setInterval(() => setStepIdx((i) => Math.min(i + 1, LOCATING_STEPS.length - 1)), 550);
    return () => clearInterval(iv);
  }, [phase]);

  function pick(s: Suggestion) {
    setSelected(s);
    setZip("");
    setZipError(false);
    setPhase("confirm");
  }

  function backToSearch() {
    setPhase("search");
    setSelected(null);
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || zip.replace(/\D/g, "").length < 5) {
      setZipError(true);
      return;
    }
    setZipError(false);
    setPhase("locating");
    const start = Date.now();
    let ok = false;
    let name = selected.business_name;
    try {
      const r = await fetch("/api/templates/find/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selected.id, zip }),
      });
      const j = (await r.json()) as { ok?: boolean; business_name?: string | null };
      ok = !!j.ok;
      if (j.business_name) name = j.business_name;
    } catch {
      ok = false;
    }
    // Hold the "locating" theatre long enough to read, then resolve.
    const dwell = reduceMotion.current ? 300 : 2100;
    const elapsed = Date.now() - start;
    if (elapsed < dwell) await new Promise((res) => setTimeout(res, dwell - elapsed));
    if (ok) {
      setFoundName(name);
      setPhase("found");
    } else {
      setZipError(true);
      setPhase("confirm");
    }
  }

  const showNoMatch = phase === "search" && query.trim().length >= 2 && !loading && suggestions.length === 0;

  return (
    <div className="fys-root" ref={rootRef}>
      <style>{CSS}</style>

      <div className="fys-orbs" aria-hidden ref={orbsRef}>
        <span className="fys-orb fys-orb-a" />
        <span className="fys-orb fys-orb-b" />
        <span className="fys-orb fys-orb-c" />
      </div>
      <div className="fys-grain" aria-hidden />

      <main className="fys-stage">
        {/* SEARCH */}
        {phase === "search" && (
          <div className="fys-hero">
            <p className="fys-eyebrow" data-enter>Your custom website is already built</p>
            <h1 className="fys-h1" data-enter>
              Find it.<br />
              Claim it <span className="fys-grad">free</span>.
            </h1>
            <p className="fys-sub" data-enter>
              Start typing your business name — we&apos;ll pull up the site we made for you.
            </p>

            <div className="fys-field" data-enter>
              <SearchIcon />
              <input
                className="fys-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Your business name…"
                aria-label="Business name"
                autoComplete="off"
                autoCapitalize="words"
                enterKeyHint="search"
                autoFocus
              />
              {loading && <span className="fys-spin" aria-hidden />}
            </div>

            <div className="fys-list" ref={listRef}>
              {suggestions.map((s) => (
                <button key={s.id} className="fys-item" data-suggestion onClick={() => pick(s)}>
                  <span className="fys-item-main">
                    <span className="fys-item-name">{s.business_name || "Your business"}</span>
                    {placeOf(s) && <span className="fys-item-place">{placeOf(s)}</span>}
                  </span>
                  <ChevronIcon />
                </button>
              ))}
              {showNoMatch && (
                <p className="fys-hint">
                  No match yet — try fewer words. If you just got your postcard, your site may still be finishing.
                </p>
              )}
            </div>
          </div>
        )}

        {/* CONFIRM */}
        {phase === "confirm" && selected && (
          <div className="fys-panel" ref={panelRef}>
            <button className="fys-back" onClick={backToSearch}>← not your business?</button>
            <div className="fys-confirm-card">
              <p className="fys-eyebrow">Confirm it&apos;s you</p>
              <h2 className="fys-h2">{selected.business_name || "Your business"}</h2>
              {placeOf(selected) && <p className="fys-place">{placeOf(selected)}</p>}
              <p className="fys-confirm-copy">
                Enter the <strong>ZIP code printed on your postcard</strong> so we can pull up the right site.
              </p>
              <form onSubmit={confirm} className="fys-zip-row">
                <input
                  className={`fys-input fys-zip ${zipError ? "fys-err" : ""}`}
                  value={zip}
                  onChange={(e) => {
                    setZip(e.target.value);
                    if (zipError) setZipError(false);
                  }}
                  placeholder="ZIP code"
                  inputMode="numeric"
                  maxLength={10}
                  aria-label="ZIP code"
                  enterKeyHint="go"
                  autoFocus
                />
                <button type="submit" className="fys-cta fys-cta-sm">Confirm</button>
              </form>
              {zipError && <p className="fys-err-msg">That ZIP doesn&apos;t match this business — check the code on your card.</p>}
            </div>
          </div>
        )}

        {/* LOCATING */}
        {phase === "locating" && selected && (
          <div className="fys-locating">
            <div className="fys-scan">
              <div className="fys-scan-beam" />
              <div className="fys-scan-grid" />
              <RadarIcon />
            </div>
            <p className="fys-locating-name">{selected.business_name || "your business"}</p>
            <p className="fys-locating-step">{LOCATING_STEPS[stepIdx]}</p>
            <div className="fys-progress">
              <span
                className="fys-progress-fill"
                style={{ animationDuration: `${reduceMotion.current ? 300 : 2100}ms` }}
              />
            </div>
          </div>
        )}

        {/* FOUND */}
        {phase === "found" && selected && (
          <div className="fys-panel fys-found" ref={panelRef}>
            <div className="fys-burst" aria-hidden>
              {Array.from({ length: 10 }).map((_, i) => <span key={i} className="fys-spark" data-spark />)}
            </div>
            <div className="fys-badge" data-pop>
              <CheckIcon />
            </div>
            <p className="fys-eyebrow fys-eyebrow-win" data-pop>We found it</p>
            <h2 className="fys-h1 fys-h1-sm" data-pop>
              <span className="fys-grad">{foundName || selected.business_name || "Your"}</span>
              <br />is ready.
            </h2>
            <p className="fys-sub" data-pop>
              Your custom website is live and waiting. View it and claim it — <strong>100% free</strong>.
            </p>
            <a className="fys-cta" href={`/s/${selected.id}`} data-pop>
              View &amp; claim my free site →
            </a>
            <p className="fys-fineprint" data-pop>No cost. No commitment. It&apos;s yours.</p>
          </div>
        )}
      </main>
    </div>
  );
}

/* ---------- inline icons (no icon dependency) ---------- */
function SearchIcon() {
  return (
    <svg className="fys-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function RadarIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" opacity="0.5" />
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.4" opacity="0.7" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

/* ---------- scoped styles ---------- */
const CSS = `
.fys-root{
  --bg0:#05070E; --hi:#EAF0FF; --lo:#8A93A8;
  --line:rgba(255,255,255,.10); --glass:rgba(255,255,255,.05);
  --grad:linear-gradient(100deg,#34E2A0 0%,#38BDF8 100%);
  position:relative; min-height:100dvh; width:100%;
  display:flex; align-items:center; justify-content:center;
  padding:max(20px,env(safe-area-inset-top)) 20px max(28px,env(safe-area-inset-bottom));
  overflow:hidden; isolation:isolate;
  color:var(--hi);
  font-family:var(--font-sans),system-ui,-apple-system,sans-serif;
  background:radial-gradient(125% 85% at 50% -12%,#101a3a 0%,#0a1124 38%,#06091a 72%,#05070E 100%);
}
.fys-orbs{position:absolute;inset:-15%;z-index:0;pointer-events:none}
.fys-orb{position:absolute;border-radius:50%;filter:blur(70px);opacity:.55;mix-blend-mode:screen;will-change:transform}
.fys-orb-a{width:62vw;height:62vw;top:-10%;left:-18%;background:radial-gradient(circle,#6D5BFF 0%,transparent 66%)}
.fys-orb-b{width:58vw;height:58vw;bottom:-16%;right:-14%;background:radial-gradient(circle,#19D3E3 0%,transparent 66%)}
.fys-orb-c{width:46vw;height:46vw;top:34%;right:8%;background:radial-gradient(circle,#1FBF8F 0%,transparent 68%);opacity:.4}
.fys-grain{position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.06;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.fys-stage{position:relative;z-index:2;width:100%;max-width:460px;display:flex;flex-direction:column}

.fys-eyebrow{font-size:12.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#7FE8C8;margin:0 0 14px}
.fys-h1{font-family:var(--font-display),var(--font-sans),sans-serif;font-weight:800;
  font-size:clamp(2.9rem,15vw,4.6rem);line-height:.92;letter-spacing:-.03em;margin:0;color:var(--hi)}
.fys-h1-sm{font-size:clamp(2.3rem,11vw,3.4rem)}
.fys-h2{font-family:var(--font-display),var(--font-sans),sans-serif;font-weight:700;font-size:clamp(1.7rem,7vw,2.3rem);line-height:1.02;letter-spacing:-.02em;margin:0 0 2px}
.fys-grad{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 0 24px rgba(52,226,160,.35))}
.fys-sub{font-size:clamp(1rem,4.2vw,1.12rem);line-height:1.5;color:var(--lo);margin:18px 0 26px;max-width:30ch}
.fys-sub strong{color:var(--hi)}

.fys-field{position:relative;display:flex;align-items:center;gap:10px;
  background:var(--glass);border:1.5px solid var(--line);border-radius:16px;
  padding:0 16px;height:60px;backdrop-filter:blur(8px);
  transition:border-color .2s,box-shadow .2s}
.fys-field:focus-within{border-color:#34E2A0;box-shadow:0 0 0 4px rgba(52,226,160,.14),0 14px 50px rgba(52,226,160,.12)}
.fys-ico{color:var(--lo);flex:0 0 auto}
.fys-input{flex:1;min-width:0;background:transparent;border:none;outline:none;color:var(--hi);
  font-size:17px;font-weight:500;font-family:inherit;height:100%}
.fys-input::placeholder{color:#5B6477}
.fys-spin{width:18px;height:18px;border-radius:50%;border:2px solid rgba(255,255,255,.18);border-top-color:#34E2A0;animation:fys-rot .7s linear infinite;flex:0 0 auto}

.fys-list{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.fys-item{display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;
  background:var(--glass);border:1.5px solid var(--line);border-radius:14px;
  padding:15px 16px;color:var(--hi);cursor:pointer;width:100%;
  transition:transform .12s,border-color .2s,background .2s;backdrop-filter:blur(8px)}
.fys-item:hover,.fys-item:focus-visible{border-color:rgba(52,226,160,.5);background:rgba(52,226,160,.06);outline:none}
.fys-item:active{transform:scale(.99)}
.fys-item-main{display:flex;flex-direction:column;gap:3px;min-width:0}
.fys-item-name{font-size:16.5px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fys-item-place{font-size:13px;color:var(--lo)}
.fys-item svg{color:#34E2A0;flex:0 0 auto}
.fys-hint{font-size:14px;line-height:1.5;color:var(--lo);padding:6px 2px;margin:6px 0 0}

.fys-panel{display:flex;flex-direction:column}
.fys-back{align-self:flex-start;background:none;border:none;color:var(--lo);font-size:14px;font-family:inherit;
  cursor:pointer;padding:6px 0;margin-bottom:14px}
.fys-back:hover{color:var(--hi)}
.fys-confirm-card{background:var(--glass);border:1.5px solid var(--line);border-radius:20px;padding:24px 22px;backdrop-filter:blur(10px)}
.fys-place{font-size:14px;color:var(--lo);margin:0 0 16px}
.fys-confirm-copy{font-size:15px;line-height:1.55;color:var(--lo);margin:14px 0 18px}
.fys-confirm-copy strong{color:var(--hi)}
.fys-zip-row{display:flex;gap:10px}
.fys-zip{background:var(--glass);border:1.5px solid var(--line);border-radius:14px;padding:0 16px;height:56px;flex:1;min-width:0;letter-spacing:.06em}
.fys-zip:focus{border-color:#34E2A0;box-shadow:0 0 0 4px rgba(52,226,160,.14)}
.fys-err{border-color:#ff6b6b !important}
.fys-err-msg{color:#ff9b9b;font-size:13.5px;line-height:1.45;margin:12px 0 0}

.fys-cta{display:inline-flex;align-items:center;justify-content:center;width:100%;
  background:var(--grad);color:#04241a;font-family:inherit;font-size:17px;font-weight:750;
  border:none;border-radius:16px;padding:18px 22px;cursor:pointer;text-decoration:none;
  box-shadow:0 12px 44px rgba(52,226,160,.32);transition:transform .14s,box-shadow .2s;
  -webkit-tap-highlight-color:transparent}
.fys-cta:hover{box-shadow:0 16px 56px rgba(52,226,160,.46)}
.fys-cta:active{transform:scale(.98)}
.fys-cta-sm{width:auto;flex:0 0 auto;font-size:15.5px;padding:0 20px;height:56px;border-radius:14px;box-shadow:0 8px 26px rgba(52,226,160,.28)}

/* locating */
.fys-locating{display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:8px}
.fys-scan{position:relative;width:150px;height:150px;border-radius:50%;display:grid;place-items:center;
  border:1.5px solid var(--line);background:radial-gradient(circle at 50% 50%,rgba(52,226,160,.10),transparent 70%);overflow:hidden;color:#7FE8C8;margin-bottom:26px}
.fys-scan-grid{position:absolute;inset:0;border-radius:50%;
  background:repeating-radial-gradient(circle at 50% 50%,rgba(255,255,255,.05) 0 1px,transparent 1px 22px)}
.fys-scan-beam{position:absolute;inset:0;border-radius:50%;
  background:conic-gradient(from 0deg,transparent 0deg,rgba(52,226,160,.55) 40deg,transparent 80deg);
  animation:fys-rot 1.4s linear infinite}
.fys-locating-name{font-family:var(--font-display),sans-serif;font-weight:700;font-size:1.5rem;margin:0 0 6px}
.fys-locating-step{font-size:15px;color:#7FE8C8;margin:0 0 22px;min-height:22px}
.fys-progress{width:min(280px,80%);height:5px;border-radius:99px;background:rgba(255,255,255,.10);overflow:hidden}
.fys-progress-fill{display:block;height:100%;width:100%;border-radius:99px;background:var(--grad);transform-origin:left;animation:fys-fill linear forwards}

/* found */
.fys-found{align-items:center;text-align:center;position:relative}
.fys-badge{width:84px;height:84px;border-radius:50%;display:grid;place-items:center;margin:0 auto 22px;color:#04241a;
  background:var(--grad);box-shadow:0 0 0 8px rgba(52,226,160,.10),0 16px 50px rgba(52,226,160,.45)}
.fys-eyebrow-win{color:#7FE8C8}
.fys-found .fys-sub{margin:14px auto 26px;text-align:center}
.fys-found .fys-cta{max-width:380px}
.fys-fineprint{font-size:13px;color:var(--lo);margin:16px 0 0}
.fys-burst{position:absolute;top:42px;left:50%;width:0;height:0;pointer-events:none}
.fys-spark{position:absolute;width:8px;height:8px;border-radius:50%;background:var(--grad);box-shadow:0 0 10px #34E2A0}

@keyframes fys-rot{to{transform:rotate(360deg)}}
@keyframes fys-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}

@media (min-width:520px){
  .fys-root{padding-top:40px}
}
@media (prefers-reduced-motion:reduce){
  .fys-orb{animation:none!important}
  .fys-scan-beam{animation:none;background:conic-gradient(from 0deg,transparent,rgba(52,226,160,.4) 60deg,transparent 120deg)}
  .fys-progress-fill,.fys-spin{animation-duration:.01ms!important}
}
`;
