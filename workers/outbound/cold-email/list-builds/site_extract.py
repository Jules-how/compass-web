#!/usr/bin/env python3
"""Site text for sendable rows: homepage, then /contact if no inbox.

httpx, then Parallel Extract on misses (concurrent). Firecrawl is opt-in.
Regex copies published emails, specialty, first name, and Hipages.
Never invents an email. Does not verify. Does not write openers.
Does not run until Jules says go (this file is the tool; a run is a later command).
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

import httpx

SCRIPT_DIR = Path(__file__).resolve().parent
_COLD_EMAIL = SCRIPT_DIR.parent
if str(_COLD_EMAIL) not in sys.path:
    sys.path.insert(0, str(_COLD_EMAIL))
from sheet_map import enrich_row, first_email, fold_header, pick
from vertical_spec import specialties_for_trade

EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.I)
HIPAGES_RE = re.compile(r"\bhipages\b", re.I)
FIRST_NAME_RE = re.compile(
    r"(?:[Ii]['’]m|[Ii] am|[Mm]y name is|[Mm]eet|[Oo]wner[:\s]+|[Dd]irector[:\s]+|[Ff]ounder[:\s]+)"
    r"\s*([A-Z][a-z]{1,14})\b"
)
JUNK_EMAIL = (
    "example.com",
    "email.com",
    "sentry.io",
    "wixpress.com",
    "cloudflare",
    "schema.org",
    "wordpress.org",
    "google.com",
    "gstatic.com",
    "w3.org",
    "sentry-next.wixpress.com",
    "godaddy.com",
)
GENERIC_FIRST = {
    "admin",
    "info",
    "contact",
    "sales",
    "office",
    "team",
    "service",
    "owner",
    "director",
    "founder",
    "locksmith",
    "plumber",
    "electrician",
    "manager",
    "support",
    "hello",
    "australia",
    "australian",
    "your",
    "our",
    "we",
    "must",
    "thank",
    "thanks",
    "built",
    "explore",
    "project",
    "commercial",
    "network",
    "with",
    "ideal",
    "the",
    "this",
    "that",
    "proudly",
    "when",
    "where",
    "here",
    "locked",
}
SLOGAN_NEXT = {
    "owned",
    "local",
    "based",
    "operated",
    "family",
    "electrician",
    "electricians",
    "team",
    "business",
    "company",
    "contractor",
    "contractors",
    "and",
}
OWNER_SKIP = (
    "pty",
    "ltd",
    "locksmith",
    "plumbing",
    "electrical",
    "hvac",
    "services",
    "group",
    "owner)",
)
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
HTTP_MIN_CHARS = 120
PAID_MIN_CHARS = 80
CHALLENGE = (
    "just a moment",
    "cf-browser-verification",
    "attention required",
    "checking your browser",
)


class _Text(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._skip = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript", "svg"}:
            self._skip += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript", "svg"} and self._skip:
            self._skip -= 1
        if tag in {"p", "div", "br", "li", "h1", "h2", "h3", "tr"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._skip:
            return
        text = data.strip()
        if text:
            self.parts.append(text + " ")


def html_to_text(html: str) -> str:
    parser = _Text()
    try:
        parser.feed(html or "")
    except Exception:
        return re.sub(r"<[^>]+>", " ", html or "")
    return re.sub(r"[ \t]+", " ", "".join(parser.parts)).strip()


def abs_url(url: str) -> str:
    text = (url or "").strip()
    if not text:
        return ""
    if not text.startswith("http"):
        return "https://" + text
    return text


def contact_page_url(site: str) -> str:
    """Origin /contact. Empty if the listing URL is already a contact page."""
    target = abs_url(site)
    if not target:
        return ""
    parsed = urlparse(target)
    path = (parsed.path or "/").rstrip("/").lower()
    if path.endswith("/contact") or path.endswith("/contact-us") or path.endswith("/contactus"):
        return ""
    if not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}/contact"


def root_host(site: str) -> str:
    host = urlparse(abs_url(site) or "https://x").hostname or ""
    host = host.removeprefix("www.")
    return host


def emails_in(text: str, site: str) -> list[str]:
    host = root_host(site)
    found: list[str] = []
    for match in EMAIL_RE.findall(text or ""):
        low = match.lower()
        if any(j in low for j in JUNK_EMAIL):
            continue
        if low not in {x.lower() for x in found}:
            found.append(match)
    same = [e for e in found if host and host in e.lower()]
    return same or found


def specialties_in(text: str, phrases: tuple[str, ...]) -> list[str]:
    blob = (text or "").lower()
    # Preserve first mention in published text, not the vertical keyword order.
    # Prefer the specific phrase when two labels start at the same character.
    hits = sorted(
        (p for p in phrases if p.lower() in blob),
        key=lambda p: (blob.find(p.lower()), -len(p)),
    )
    seen: list[str] = []
    for hit in hits:
        if hit.lower() not in {s.lower() for s in seen}:
            seen.append(hit)
    return seen


def hipages_in(text: str) -> bool:
    return bool(HIPAGES_RE.search(text or ""))


def first_name_in(text: str) -> str:
    blob = text or ""
    for match in FIRST_NAME_RE.finditer(blob):
        token = (match.group(1) or "").strip()
        if token.lower() in GENERIC_FIRST:
            continue
        nxt = re.match(r"([A-Za-z]+)", blob[match.end():].lstrip())
        if nxt and nxt.group(1).lower() in SLOGAN_NEXT:
            continue
        if re.search(rf"\b{re.escape(token)}\b", blob):
            return token
    return ""


def first_name_from_maps(owner_name: str) -> str:
    raw = (owner_name or "").strip()
    if not raw:
        return ""
    low = raw.lower()
    if any(tok in low for tok in OWNER_SKIP):
        return ""
    token = re.split(r"[\s(]", raw, maxsplit=1)[0].strip()
    if not token or not token[0].isalpha() or token.lower() in GENERIC_FIRST:
        return ""
    if token.lower() != token and token[:1].isupper() and token[1:].islower():
        return token
    return ""


def empty_fetch(url: str, error: str, source: str = "fail") -> dict:
    return {
        "ok": False,
        "source": source,
        "status": 0,
        "text": "",
        "error": error,
        "elapsed_s": 0.0,
        "final_url": url,
    }


def http_fetch(url: str) -> dict:
    target = abs_url(url)
    if not target:
        return empty_fetch(url, "no_url")
    t0 = time.perf_counter()
    try:
        with httpx.Client(follow_redirects=True, timeout=20.0, headers={"User-Agent": UA}) as client:
            resp = client.get(target)
        elapsed = time.perf_counter() - t0
        ctype = (resp.headers.get("content-type") or "").lower()
        raw = resp.text or ""
        challenge = any(x in raw.lower() for x in CHALLENGE)
        text = html_to_text(raw) if "html" in ctype or raw.lstrip().startswith("<") else raw
        ok = resp.status_code == 200 and len(text) >= HTTP_MIN_CHARS and not challenge
        return {
            "ok": ok,
            "source": "http" if ok else "http_fail",
            "status": resp.status_code,
            "text": text if ok else "",
            "error": "" if ok else ("challenge" if challenge else f"http {resp.status_code} chars={len(text)}"),
            "elapsed_s": round(elapsed, 3),
            "final_url": str(resp.url),
        }
    except Exception as exc:
        return {
            "ok": False,
            "source": "http_fail",
            "status": 0,
            "text": "",
            "error": str(exc)[:200],
            "elapsed_s": round(time.perf_counter() - t0, 3),
            "final_url": target,
        }


def parse_parallel_json(blob: str) -> dict:
    data = json.loads(blob or "{}")
    if data.get("status") not in {"ok", "completed", None} and data.get("results") is None:
        return {"ok": False, "text": "", "error": (data.get("status") or "bad_json")[:200]}
    results = data.get("results") or []
    if not results:
        err = ""
        errors = data.get("errors") or []
        if errors:
            err = str(errors[0])[:200]
        return {"ok": False, "text": "", "error": err or "no_results"}
    row = results[0] if isinstance(results[0], dict) else {}
    text = (row.get("full_content") or "").strip()
    if not text:
        excerpts = row.get("excerpts") or []
        if isinstance(excerpts, list):
            text = "\n".join(str(x) for x in excerpts if x).strip()
        else:
            text = str(excerpts or "").strip()
    ok = len(text) >= PAID_MIN_CHARS
    return {"ok": ok, "text": text if ok else "", "error": "" if ok else "thin"}


def parallel_extract(url: str, *, timeout: float = 45.0) -> dict:
    target = abs_url(url)
    t0 = time.perf_counter()
    try:
        proc = subprocess.run(
            [
                "parallel-cli",
                "extract",
                target,
                "--json",
                "--full-content",
                "--objective",
                "Visible homepage text for a local trade business. Keep emails, names, services, and Hipages badges.",
                "--timeout-seconds",
                str(int(timeout)),
            ],
            capture_output=True,
            text=True,
            timeout=timeout + 10,
            check=False,
        )
        elapsed = time.perf_counter() - t0
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or f"exit {proc.returncode}")[:200]
            return {
                "ok": False,
                "source": "parallel_fail",
                "status": proc.returncode,
                "text": "",
                "error": err,
                "elapsed_s": round(elapsed, 3),
                "final_url": target,
            }
        parsed = parse_parallel_json(proc.stdout)
        return {
            "ok": parsed["ok"],
            "source": "parallel" if parsed["ok"] else "parallel_fail",
            "status": 200 if parsed["ok"] else 0,
            "text": parsed["text"],
            "error": parsed["error"],
            "elapsed_s": round(elapsed, 3),
            "final_url": target,
        }
    except FileNotFoundError:
        return empty_fetch(target, "parallel-cli not installed", "parallel_fail")
    except Exception as exc:
        return {
            "ok": False,
            "source": "parallel_fail",
            "status": 0,
            "text": "",
            "error": str(exc)[:200],
            "elapsed_s": round(time.perf_counter() - t0, 3),
            "final_url": target,
        }


def load_firecrawl_key() -> str:
    key = (os.environ.get("FIRECRAWL_API_KEY") or "").strip()
    if key:
        return key
    cred = Path.home() / "Library/Application Support/firecrawl-cli/credentials.json"
    if cred.exists():
        data = json.loads(cred.read_text(encoding="utf-8"))
        return (data.get("apiKey") or "").strip()
    return ""


def firecrawl_scrape(url: str, api_key: str, *, timeout: int = 60) -> dict:
    target = abs_url(url)
    if not api_key:
        return empty_fetch(target, "no_firecrawl_key", "firecrawl_fail")
    payload = json.dumps({"url": target, "formats": ["markdown"], "onlyMainContent": True}).encode("utf-8")
    req = urllib.request.Request(
        "https://api.firecrawl.dev/v1/scrape",
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        elapsed = time.perf_counter() - t0
        inner = data.get("data") or {}
        md = inner.get("markdown") or ""
        ok = bool(data.get("success")) and len(md.strip()) >= PAID_MIN_CHARS
        return {
            "ok": ok,
            "source": "firecrawl" if ok else "firecrawl_fail",
            "status": (inner.get("metadata") or {}).get("statusCode") or 200,
            "text": md if ok else "",
            "error": "" if ok else (data.get("error") or "thin"),
            "elapsed_s": round(elapsed, 3),
            "final_url": target,
        }
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")[:200]
        return {
            "ok": False,
            "source": "firecrawl_fail",
            "status": exc.code,
            "text": "",
            "error": f"http {exc.code}: {err_body}",
            "elapsed_s": round(time.perf_counter() - t0, 3),
            "final_url": target,
        }
    except Exception as exc:
        return {
            "ok": False,
            "source": "firecrawl_fail",
            "status": 0,
            "text": "",
            "error": str(exc)[:200],
            "elapsed_s": round(time.perf_counter() - t0, 3),
            "final_url": target,
        }


def paid_already(cached: dict | None) -> bool:
    if not cached:
        return False
    src = cached.get("source") or ""
    if src in {"parallel", "firecrawl", "fail", "parallel_fail", "firecrawl_fail"}:
        return True
    return bool(cached.get("parallel_error") or cached.get("firecrawl_error"))


def fetch_page(
    url: str,
    *,
    use_parallel: bool = True,
    use_firecrawl: bool = False,
    firecrawl_key: str = "",
    http_fn=http_fetch,
    parallel_fn=parallel_extract,
    firecrawl_fn=firecrawl_scrape,
    sleep_s: float = 0.0,
) -> dict:
    """httpx first. Parallel Extract on miss. Firecrawl only if opted in and Parallel is empty."""
    got = http_fn(url)
    if got.get("ok"):
        got["source"] = "http"
        return got
    miss = dict(got)
    if use_parallel:
        if sleep_s:
            time.sleep(sleep_s)
        paid = parallel_fn(url)
        if paid.get("ok") and paid.get("text"):
            paid["source"] = "parallel"
            return paid
        miss["parallel_error"] = (paid.get("error") or "")[:200]
    if use_firecrawl:
        if sleep_s:
            time.sleep(sleep_s)
        last = firecrawl_fn(url, firecrawl_key)
        if last.get("ok") and last.get("text"):
            last["source"] = "firecrawl"
            return last
        miss["firecrawl_error"] = (last.get("error") or "")[:200]
        miss["source"] = "fail"
        return miss
    miss["source"] = "fail"
    return miss


def run_paid_misses(
    misses: list[tuple[str, str]],
    fetches: dict[str, dict],
    *,
    use_parallel: bool,
    use_firecrawl: bool,
    firecrawl_key: str,
    parallel_fn,
    firecrawl_fn,
    sleep_s: float,
    workers: int,
    cache_dir: Path | None,
    label: str,
) -> tuple[int, int, float]:
    parallel_ok = 0
    firecrawl_ok = 0
    if not misses:
        return 0, 0, 0.0
    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futs = {}
        for key, site in misses:
            prior = fetches.get(key) or empty_fetch(site, "missing")
            futs[
                pool.submit(
                    fetch_page,
                    site,
                    use_parallel=use_parallel,
                    use_firecrawl=use_firecrawl,
                    firecrawl_key=firecrawl_key,
                    http_fn=lambda _u, g=prior: g,
                    parallel_fn=parallel_fn,
                    firecrawl_fn=firecrawl_fn,
                    sleep_s=sleep_s,
                )
            ] = key
        done = 0
        for fut in as_completed(futs):
            key = futs[fut]
            got = fut.result()
            fetches[key] = got
            if got.get("source") == "parallel":
                parallel_ok += 1
            elif got.get("source") == "firecrawl":
                firecrawl_ok += 1
            if cache_dir:
                cache_dir.mkdir(parents=True, exist_ok=True)
                cache_path(cache_dir, key).write_text(json.dumps(got, default=str), encoding="utf-8")
            done += 1
            if done % 10 == 0 or done == len(futs):
                print(
                    f"{label} {done}/{len(futs)} parallel={parallel_ok} firecrawl={firecrawl_ok}",
                    flush=True,
                )
    return parallel_ok, firecrawl_ok, time.perf_counter() - t0


def join_hipages(existing: str, found: bool) -> str:
    cell = (existing or "").strip()
    if not found:
        return cell
    parts = [p.strip() for p in re.split(r"[;|,]", cell) if p.strip()]
    if any(p.lower() == "hipages" for p in parts):
        return "; ".join(parts) if parts else "Hipages"
    parts.append("Hipages")
    return "; ".join(parts)


def live_email(row: dict) -> str:
    view = enrich_row(row)
    return first_email(
        view.get("verified_email")
        or view.get("primary_email")
        or view.get("email")
        or view.get("work_email")
        or view.get("emails")
        or view.get("found_emails")
    )


def stamp_row(row: dict, fetch: dict, phrases: tuple[str, ...]) -> dict:
    """Copy published facts onto the row. Maps / existing cells win when filled."""
    out = dict(row)
    text = fetch.get("text") or ""
    site = pick(row, "website", "website_url", "url")
    specs = specialties_in(text, phrases) if text else []
    mails = emails_in(text, site) if text else []
    name = first_name_in(text) if text else ""
    maps_name = first_name_from_maps(pick(row, "ownerName", "owner_name", "first_name"))
    if not pick(row, "first_name") and (maps_name or name):
        out["first_name"] = maps_name or name
    if not pick(row, "specialty") and specs:
        out["specialty"] = "; ".join(specs)
    if text and hipages_in(text):
        out["paid_demand"] = join_hipages(pick(row, "paid_demand"), True)
    if mails and not live_email(row):
        out["email"] = mails[0]
        out["found_emails"] = ";".join(mails)
    elif mails:
        out["found_emails"] = ";".join(mails)
    out["fetch_ok"] = "true" if fetch.get("ok") else "false"
    out["fetch_source"] = fetch.get("source") or "fail"
    out["fetch_error"] = (fetch.get("error") or "")[:200]
    out["fetch_chars"] = str(len(text))
    return out


def row_id(row: dict, index: int) -> str:
    pid = (row.get("placeId") or row.get("place_id") or "").strip()
    if pid:
        return pid
    site = pick(row, "website", "website_url")
    if site:
        return re.sub(r"[^a-z0-9]+", "_", site.lower())[:80]
    return f"row{index}"


def cache_path(cache_dir: Path, key: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", key)[:120]
    return cache_dir / f"{safe}.json"


def load_cache(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def process_rows(
    rows: list[dict],
    *,
    trade: str,
    use_parallel: bool,
    use_firecrawl: bool,
    workers: int,
    cache_dir: Path | None,
    resume: bool,
    sleep_s: float,
    http_fn=http_fetch,
    parallel_fn=parallel_extract,
    firecrawl_fn=firecrawl_scrape,
) -> tuple[list[dict], dict]:
    phrases = specialties_for_trade(trade)
    fc_key = load_firecrawl_key() if use_firecrawl else ""
    jobs = []
    for i, row in enumerate(rows):
        site = pick(row, "website", "website_url", "url")
        if site:
            jobs.append((i, row_id(row, i), site))

    fetches: dict[str, dict] = {}
    http_pending = []
    misses: list[tuple[str, str]] = []
    for i, key, site in jobs:
        cached = load_cache(cache_path(cache_dir, key)) if resume and cache_dir else None
        if cached and cached.get("ok"):
            fetches[key] = cached
        elif cached and paid_already(cached):
            fetches[key] = cached
        elif cached:
            fetches[key] = cached
            misses.append((key, site))
        else:
            http_pending.append((i, key, site))

    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futs = {pool.submit(http_fn, site): key for _, key, site in http_pending}
        done = 0
        for fut in as_completed(futs):
            key = futs[fut]
            fetches[key] = fut.result()
            done += 1
            if done % 50 == 0 or done == len(futs):
                print(f"http {done}/{len(futs)}", flush=True)
    http_wall = time.perf_counter() - t0

    misses.extend((key, site) for _, key, site in http_pending if not fetches.get(key, {}).get("ok"))
    p_ok, f_ok, miss_wall = run_paid_misses(
        misses,
        fetches,
        use_parallel=use_parallel,
        use_firecrawl=use_firecrawl,
        firecrawl_key=fc_key,
        parallel_fn=parallel_fn,
        firecrawl_fn=firecrawl_fn,
        sleep_s=sleep_s,
        workers=workers,
        cache_dir=cache_dir,
        label="miss",
    )
    parallel_ok = p_ok
    firecrawl_ok = f_ok

    if cache_dir:
        cache_dir.mkdir(parents=True, exist_ok=True)
        for _, key, _site in jobs:
            got = fetches.get(key)
            if got:
                cache_path(cache_dir, key).write_text(json.dumps(got, default=str), encoding="utf-8")

    stamped = []
    for i, row in enumerate(rows):
        key = row_id(row, i)
        site = pick(row, "website", "website_url", "url")
        if not site:
            out = dict(row)
            out["fetch_ok"] = ""
            out["fetch_source"] = "no_website"
            out["fetch_error"] = ""
            out["fetch_chars"] = "0"
            stamped.append(out)
            continue
        stamped.append(stamp_row(row, fetches.get(key) or empty_fetch(site, "missing"), phrases))

    contact_jobs = []
    for i, row in enumerate(stamped):
        site = pick(row, "website", "website_url", "url")
        contact = contact_page_url(site)
        if not site or not contact or live_email(row):
            continue
        ckey = row_id(row, i) + "__contact"
        contact_jobs.append((i, ckey, contact))

    contact_queued = len(contact_jobs)
    contact_http_ok = 0
    if contact_jobs:
        contact_pending = []
        contact_misses: list[tuple[str, str]] = []
        for i, ckey, contact in contact_jobs:
            cached = load_cache(cache_path(cache_dir, ckey)) if resume and cache_dir else None
            if cached and cached.get("ok"):
                fetches[ckey] = cached
            elif cached and paid_already(cached):
                fetches[ckey] = cached
            elif cached:
                fetches[ckey] = cached
                contact_misses.append((ckey, contact))
            else:
                contact_pending.append((i, ckey, contact))
        t2 = time.perf_counter()
        with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
            futs = {pool.submit(http_fn, url): ckey for _, ckey, url in contact_pending}
            done = 0
            for fut in as_completed(futs):
                ckey = futs[fut]
                fetches[ckey] = fut.result()
                done += 1
                if done % 50 == 0 or done == len(futs):
                    print(f"contact http {done}/{len(futs)}", flush=True)
        http_wall += time.perf_counter() - t2
        contact_misses.extend(
            (ckey, url) for _, ckey, url in contact_pending if not fetches.get(ckey, {}).get("ok")
        )
        cp_ok, cf_ok, cwall = run_paid_misses(
            contact_misses,
            fetches,
            use_parallel=use_parallel,
            use_firecrawl=use_firecrawl,
            firecrawl_key=fc_key,
            parallel_fn=parallel_fn,
            firecrawl_fn=firecrawl_fn,
            sleep_s=sleep_s,
            workers=workers,
            cache_dir=cache_dir,
            label="contact miss",
        )
        parallel_ok += cp_ok
        firecrawl_ok += cf_ok
        miss_wall += cwall
        misses.extend(contact_misses)
        if cache_dir:
            for _, ckey, _url in contact_jobs:
                got = fetches.get(ckey)
                if got:
                    cache_path(cache_dir, ckey).write_text(json.dumps(got, default=str), encoding="utf-8")
        for i, ckey, _url in contact_jobs:
            got = fetches.get(ckey)
            if not got:
                continue
            stamped[i] = stamp_row(stamped[i], got, phrases)
            if got.get("source") == "http" and got.get("ok"):
                contact_http_ok += 1
            if got.get("ok") and got.get("source"):
                stamped[i]["fetch_source"] = f"{stamped[i].get('fetch_source') or ''}+contact".strip("+")

    summary = {
        "rows": len(rows),
        "with_website": len(jobs),
        "http_ok": sum(1 for v in fetches.values() if v.get("source") == "http" and v.get("ok")),
        "parallel_recovered": parallel_ok,
        "firecrawl_recovered": firecrawl_ok,
        "fetch_ok": sum(1 for r in stamped if r.get("fetch_ok") == "true"),
        "with_email": sum(1 for r in stamped if live_email(r)),
        "with_specialty": sum(1 for r in stamped if (r.get("specialty") or "").strip()),
        "with_first_name": sum(1 for r in stamped if (r.get("first_name") or "").strip()),
        "with_hipages": sum(1 for r in stamped if "hipages" in (r.get("paid_demand") or "").lower()),
        "http_wall_s": round(http_wall, 1),
        "miss_wall_s": round(miss_wall, 1),
        "misses_queued": len(misses),
        "contact_queued": contact_queued,
        "contact_http_ok": contact_http_ok,
    }
    return stamped, summary


def write_csv(path: Path, rows: list[dict], original_fields: list[str]) -> None:
    extra = [
        "email",
        "found_emails",
        "specialty",
        "first_name",
        "paid_demand",
        "fetch_ok",
        "fetch_source",
        "fetch_error",
        "fetch_chars",
    ]
    fields = list(original_fields)
    for col in extra:
        if col not in fields:
            fields.append(col)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Homepage extract on a sendable sheet. Does not scrape until you run it.")
    parser.add_argument("input_csv", help="Sendable CSV from filter_leads.py")
    parser.add_argument("--trade", required=True)
    parser.add_argument("--output", default="", help="Default: overwrite input")
    parser.add_argument("--cache-dir", default="")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--skip-parallel", action="store_true")
    parser.add_argument(
        "--firecrawl",
        action="store_true",
        help="Last hop if Parallel returned empty. Off by default.",
    )
    parser.add_argument("--skip-firecrawl", action="store_true")
    parser.add_argument("--workers", type=int, default=24)
    parser.add_argument("--sleep", type=float, default=0.0, help="Pause before each paid hop inside a worker")
    args = parser.parse_args(argv)

    src = Path(args.input_csv).resolve()
    if not src.exists():
        raise SystemExit(f"missing {src}")
    with src.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = list(reader.fieldnames or [])
        rows = list(reader)
    out_path = Path(args.output).resolve() if args.output else src
    cache = Path(args.cache_dir) if args.cache_dir else src.parent / "site-extract-cache"
    stamped, summary = process_rows(
        rows,
        trade=args.trade,
        use_parallel=not args.skip_parallel,
        use_firecrawl=bool(args.firecrawl) and not args.skip_firecrawl,
        workers=args.workers,
        cache_dir=cache,
        resume=args.resume,
        sleep_s=args.sleep,
    )
    write_csv(out_path, stamped, fields)
    summary_path = cache / "summary.json"
    cache.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print(f"wrote {out_path}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
