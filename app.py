import os, glob, re, time, yaml
from pathlib import Path
from datetime import datetime, timezone
from flask import Flask, render_template, send_from_directory, abort, request, url_for, jsonify, Response
from humanize import naturaltime as _naturaltime
from xml.sax.saxutils import escape as xml_escape

# Optional: render manga.yml description as Markdown
try:
    import markdown as _md
    from markupsafe import Markup, escape
    USE_MD = True
except Exception:
    USE_MD = False

# ---------- Paths ----------
BASE_DIR    = Path(__file__).resolve().parent
CONTENT_DIR = Path(os.environ.get("CONTENT_DIR", BASE_DIR / "content"))
STATIC_DIR  = BASE_DIR / "static"
UPDATED_MANIFEST = Path(os.environ.get("UPDATED_MANIFEST", CONTENT_DIR / "_updated.yml"))

# ---------- Flask ----------
app = Flask(__name__, static_folder=str(STATIC_DIR), template_folder=str(BASE_DIR / "templates"))

@app.context_processor
def inject_datetime():
    return {"datetime": datetime}

# ---------- Jinja filters ----------
if USE_MD:
    @app.template_filter('md')
    def md_filter(text):
        if not text:
            return ""
        html = _md.markdown(text, extensions=['extra', 'sane_lists', 'nl2br'])
        return Markup(html)

    @app.template_filter('nl2br')
    def nl2br(s: str):
        if not s:
            return ""
        return Markup("<br>".join(escape(s).splitlines()))

# ---------- Time helpers ----------
def to_utc_naive(dt: datetime) -> datetime:
    """Normalize any datetime to UTC-naïve."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt

def parse_iso(dt: str | None) -> datetime:
    """Parse ISO from manifest and normalize to UTC-naïve."""
    if not dt:
        return datetime.min
    try:
        d = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        return to_utc_naive(d)
    except Exception:
        return datetime.min

def naturaltime_utc(dt: datetime) -> str:
    """Show 'x minutes ago' using aware UTC datetimes (lint-safe)."""
    dt_aware = dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    now_aware = datetime.now(timezone.utc)
    return _naturaltime(dt_aware, when=now_aware)

def _utc_aware(dt: datetime) -> datetime:
    """Return an aware UTC datetime; RSS/linters prefer this."""
    return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

def _rfc2822(dt: datetime) -> str:
    from email.utils import format_datetime
    return format_datetime(_utc_aware(dt))

def _recent_updates(limit: int = 50):
    """List of (updated_dt, manga, chapter) across all manga, newest first."""
    items = []
    for m in scan_content().values():
        for c in m.chapters:
            items.append((c.updated, m, c))
    items.sort(key=lambda t: t[0], reverse=True)
    return items[:limit]

def _lastmod_date(dt: datetime | None) -> str:
    """ISO date for sitemaps, using an aware UTC fallback."""
    if not dt or dt == datetime.min:
        return datetime.now(timezone.utc).date().isoformat()
    return _utc_aware(dt).date().isoformat()

# ---------- Other helpers ----------
IMG_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".gif")

def chapter_display_title(slug: str) -> str:
    s = slug.replace('_', '-').lower()
    m = re.search(r'(\d+(?:\.\d+)?)', s)
    if m:
        num = m.group(1)
        return f"Chapter {int(num) if num.isdigit() else num}"
    return slug.replace('-', ' ').title()

def chapter_num(slug: str) -> float:
    nums = re.findall(r'(\d+(?:\.\d+)?)', slug)
    if not nums:
        return float("inf")
    try:
        return float(nums[-1])
    except ValueError:
        return float("inf")

# ---------- Models ----------
class Page:
    def __init__(self, path: Path, index: int):
        self.path = path
        self.index = index
    @property
    def url(self):
        rel = self.path.relative_to(CONTENT_DIR)
        return url_for("serve_content", subpath=str(rel).replace("\\", "/"))

class Chapter:
    def __init__(self, slug: str, dirpath: Path, pages, updated: datetime, timestamp: datetime):
        self.slug = slug
        self.dirpath = dirpath
        self.pages = pages
        self.updated = updated      # UTC-naïve
        self.timestamp = timestamp  # UTC-naïve

    @property
    def number(self) -> float: return chapter_num(self.slug)
    @property
    def display_title(self) -> str: return chapter_display_title(self.slug)

class Manga:
    def __init__(self, slug: str, meta: dict, dirpath: Path, chapters):
        self.slug = slug
        self.dirpath = dirpath
        self.title = meta.get("title", slug.replace("-", " ").title())
        self.alt_titles = meta.get("alt_titles", [])
        self.author = meta.get("author", "Unknown")
        self.artist = meta.get("artist", meta.get("author", "Unknown"))
        self.description = meta.get("description", "")
        self.tags = meta.get("tags", [])
        self.status = meta.get("status", "Ongoing")
        self.cover = meta.get("cover", "cover.jpg")
        self.chapters = chapters  # ASC (scanner order)

    @property
    def cover_url(self):
        rel = (self.dirpath / self.cover).relative_to(CONTENT_DIR)
        return url_for("serve_content", subpath=str(rel).replace("\\", "/"))

    @property
    def latest_chapter(self):
        return max(self.chapters, key=lambda c: (c.number, c.updated), default=None)

    @property
    def updated(self) -> datetime:
        if not self.chapters:
            return datetime.min
        return max((c.updated for c in self.chapters), default=datetime.min)

# ---------- Manifest ----------
def load_updated_manifest() -> dict:
    try:
        with UPDATED_MANIFEST.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
            return {str(k): (v or {}) for k, v in data.items()} if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except Exception:
        return {}

# ---------- Scanner (cached) ----------
MANGAS = {}
LAST_SCAN = 0
SCAN_INTERVAL = 10  # seconds

def scan_content():
    """Scan ./content and apply updated times from manifest (UTC-naïve)."""
    global MANGAS, LAST_SCAN
    now = time.time()
    if now - LAST_SCAN < SCAN_INTERVAL and MANGAS:
        return MANGAS

    manifest = load_updated_manifest()
    mangas = {}
    CONTENT_DIR.mkdir(parents=True, exist_ok=True)

    for mdir in sorted(p for p in CONTENT_DIR.iterdir() if p.is_dir()):
        slug = mdir.name
        if slug.startswith("_"):
            continue

        # metadata
        meta = {}
        mp = mdir / "manga.yml"
        if mp.exists():
            with mp.open("r", encoding="utf-8") as f:
                meta = yaml.safe_load(f) or {}

        chapters = []
        for cdir in sorted(p for p in mdir.iterdir() if p.is_dir()):
            img_paths = sorted(
                Path(p) for p in glob.glob(str(cdir / "*"))
                if p.lower().endswith(IMG_EXTS)
            )
            if not img_paths:
                continue

            pages = [Page(path=img, index=i) for i, img in enumerate(img_paths, start=1)]

            # directory mtime fallback (aware UTC -> UTC-naïve)
            try:
                dir_ts = to_utc_naive(datetime.fromtimestamp(cdir.stat().st_mtime, tz=timezone.utc))
            except Exception:
                dir_ts = datetime.min

            # manifest time (preferred)
            man = manifest.get(slug, {})
            updated = parse_iso(man.get(cdir.name))

            # if manifest missing, fallback to newest file mtime (UTC-naïve)
            if updated == datetime.min:
                try:
                    newest = max(p.stat().st_mtime for p in img_paths)
                    updated = to_utc_naive(datetime.fromtimestamp(newest, tz=timezone.utc))
                except Exception:
                    updated = dir_ts

            chapters.append(Chapter(
                slug=cdir.name, dirpath=cdir, pages=pages,
                updated=updated, timestamp=dir_ts
            ))

        # Store ASC internally; we’ll sort per-view as needed
        chapters.sort(key=lambda c: (c.number, c.updated, c.timestamp))
        mangas[slug] = Manga(slug=slug, meta=meta, dirpath=mdir, chapters=chapters)

    MANGAS = mangas
    LAST_SCAN = now
    return mangas

def paginate(items, page, per_page=16):
    import math as _math
    total = len(items)
    pages = max(1, _math.ceil(total / per_page))
    page = max(1, min(page, pages))
    s = (page - 1) * per_page
    e = s + per_page
    return items[s:e], page, pages, total

# ---------- Chapter sort helpers ----------
def chapter_sort_params(sort_name: str):
    """
    Return (key_fn, reverse) for the selected chapter sort.
    Defaults to 'number_desc'.
    """
    mapping = {
        "number_desc":  (lambda c: (c.number, c.updated, c.timestamp), True),
        "number_asc":   (lambda c: (c.number, c.updated, c.timestamp), False),
        "updated_desc": (lambda c: (c.updated, c.number, c.timestamp), True),
        "updated_asc":  (lambda c: (c.updated, c.number, c.timestamp), False),
    }
    return mapping.get(sort_name or "number_desc", mapping["number_desc"])

# ---------- Routes ----------
@app.route("/")
def index():
    mangas = list(scan_content().values())

    q   = request.args.get("q", "").strip().lower()
    tag = request.args.get("tag", "").strip().lower()

    if q:
        def match(m: Manga):
            hay = " ".join([m.title] + m.alt_titles + [m.author, m.artist, " ".join(m.tags)]).lower()
            return q in hay
        mangas = list(filter(match, mangas))

    if tag:
        mangas = [m for m in mangas if any(tag == t.lower() for t in m.tags)]

    # Sort by last updated for library
    mangas.sort(key=lambda m: m.updated, reverse=True)

    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 16))
    items, page, pages, total = paginate(mangas, page, per_page)

    all_tags = sorted({t for m in scan_content().values() for t in m.tags})

    return render_template(
        "index.html",
        mangas=items, page=page, pages=pages, total=total,
        q=q, tag=tag, all_tags=all_tags, naturaltime=naturaltime_utc
    )

@app.route("/manga/<slug>")
def manga_detail(slug):
    manga = scan_content().get(slug)
    if not manga:
        abort(404)

    sort = request.args.get("sort", "number_desc")
    key_fn, rev = chapter_sort_params(sort)
    chapters_sorted = sorted(manga.chapters, key=key_fn, reverse=rev)

    return render_template(
        "manga_detail.html",
        manga=manga, chapters=chapters_sorted, sort=sort, naturaltime=naturaltime_utc
    )

@app.route("/manga/<slug>/<chapter_slug>")
def reader(slug, chapter_slug):
    manga = scan_content().get(slug)
    if not manga:
        abort(404)

    chapters = manga.chapters  # ASC internally
    try:
        idx = next(i for i, c in enumerate(chapters) if c.slug == chapter_slug)
    except StopIteration:
        abort(404)

    chapter = chapters[idx]
    prev_ch = chapters[idx - 1] if idx > 0 else None
    next_ch = chapters[idx + 1] if idx + 1 < len(chapters) else None

    return render_template("reader.html", manga=manga, chapter=chapter, prev_ch=prev_ch, next_ch=next_ch)

@app.route("/content/<path:subpath>")
def serve_content(subpath):
    return send_from_directory(CONTENT_DIR, subpath)

@app.route("/admin/debug-updated")
def debug_updated():
    out = {}
    for m in scan_content().values():
        out[m.slug] = {
            "title": m.title,
            "updated": m.updated.isoformat(),
            "chapters": [
                {"slug": c.slug, "updated": c.updated.isoformat(), "pages": len(c.pages)}
                for c in m.chapters
            ],
        }
    return jsonify(out)

@app.route("/api/mangas")
def api_mangas():
    data = []
    for m in scan_content().values():
        data.append({
            "slug": m.slug,
            "title": m.title,
            "author": m.author,
            "tags": m.tags,
            "updated": m.updated.isoformat(),
            "latest_chapter": m.latest_chapter.slug if m.latest_chapter else None,
        })
    return jsonify(data)
@app.route("/feed.xml")
def feed_xml():
    items = _recent_updates(50)
    site_title = "Otaku Manga"
    channel_title = f"{site_title} — Latest Updates"
    site_link = url_for("index", _external=True)
    self_link = url_for("feed_xml", _external=True)

    # was: datetime.utcnow()
    last_build = items[0][0] if items else datetime.now(timezone.utc)

    parts = []
    parts.append('<?xml version="1.0" encoding="UTF-8"?>')
    parts.append('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">')
    parts.append("<channel>")
    parts.append(f"<title>{xml_escape(channel_title)}</title>")
    parts.append(f"<link>{xml_escape(site_link)}</link>")
    parts.append(f"<description>{xml_escape('Newest chapter releases and updates')}</description>")
    parts.append("<language>en</language>")
    parts.append(f"<lastBuildDate>{_rfc2822(last_build)}</lastBuildDate>")
    parts.append(f'<atom:link href="{xml_escape(self_link)}" rel="self" type="application/rss+xml" />')

    for dt, manga, ch in items:
        item_title = f"{manga.title} — {ch.display_title}"
        item_link = url_for("reader", slug=manga.slug, chapter_slug=ch.slug, _external=True)
        guid = item_link  # stable enough for this use
        desc = f"{manga.title} • {ch.display_title} • {len(ch.pages)} pages"

        parts.append("<item>")
        parts.append(f"<title>{xml_escape(item_title)}</title>")
        parts.append(f"<link>{xml_escape(item_link)}</link>")
        parts.append(f"<guid isPermaLink='true'>{xml_escape(guid)}</guid>")
        parts.append(f"<pubDate>{_rfc2822(dt)}</pubDate>")
        parts.append(f"<description><![CDATA[{desc}]]></description>")
        parts.append("</item>")

    parts.append("</channel></rss>")
    xml = "\n".join(parts)
    return Response(xml, mimetype="application/rss+xml")

@app.route("/robots.txt")
def robots_txt():
    txt = "\n".join([
        "User-agent: *",
        "Allow: /",
        "",
        f"Sitemap: https://otaku-manga.site/sitemap.xml",
    ])
    return Response(txt, mimetype="text/plain")


@app.route("/sitemap.xml")
def sitemap_xml():
    urls = [{
        "loc": url_for("index", _external=True),
        "lastmod": _lastmod_date(datetime.now(timezone.utc)),
        "priority": "1.0"
    }]

    data = scan_content()
    for m in data.values():
        urls.append({
            "loc": url_for("manga_detail", slug=m.slug, _external=True),
            "lastmod": _lastmod_date(m.updated),
            "priority": "0.8"
        })
        for c in m.chapters:
            urls.append({
                "loc": url_for("reader", slug=m.slug, chapter_slug=c.slug, _external=True),
                "lastmod": _lastmod_date(c.updated or m.updated),
                "priority": "0.6"
            })

    xml_parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    ]
    for u in urls:
        xml_parts.append("<url>")
        xml_parts.append(f"<loc>{u['loc']}</loc>")
        xml_parts.append(f"<lastmod>{u['lastmod']}</lastmod>")
        xml_parts.append(f"<priority>{u['priority']}</priority>")
        xml_parts.append("</url>")
    xml_parts.append("</urlset>")
    return Response("\n".join(xml_parts), mimetype="application/xml")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
