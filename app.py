import glob, os, re, time, yaml
from pathlib import Path
from datetime import datetime
from flask import Flask, render_template, send_from_directory, abort, request, url_for, jsonify
from humanize import naturaltime

# Optional Markdown rendering for YAML descriptions
try:
    import markdown as _md
    from markupsafe import Markup, escape
    USE_MD = True
except Exception:
    USE_MD = False

BASE_DIR    = Path(__file__).resolve().parent
CONTENT_DIR = Path(os.environ.get("CONTENT_DIR", BASE_DIR / "content"))
STATIC_DIR  = BASE_DIR / "static"
UPDATED_MANIFEST = Path(os.environ.get("UPDATED_MANIFEST", CONTENT_DIR / "_updated.yml"))

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

# ------------ helpers ------------
def parse_iso(dt: str | None) -> datetime:
    if not dt:
        return datetime.min
    try:
        # Normalize 'Z' to +00:00 and drop tzinfo to keep naive UTC for comparisons
        return datetime.fromisoformat(dt.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return datetime.min

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

class Page:
    def __init__(self, path: Path, index: int):
        self.path = path; self.index = index
    @property
    def url(self):
        rel = self.path.relative_to(CONTENT_DIR)
        return url_for("serve_content", subpath=str(rel).replace("\\", "/"))

class Chapter:
    def __init__(self, slug: str, dirpath: Path, pages, updated: datetime, timestamp: datetime):
        self.slug = slug
        self.dirpath = dirpath
        self.pages = pages
        self.updated = updated      # from manifest or fallback
        self.timestamp = timestamp  # dir mtime (fallback/tie-break)

    @property
    def number(self) -> float: return chapter_num(self.slug)
    @property
    def display_title(self) -> str: return chapter_display_title(self.slug)

class Manga:
    def __init__(self, slug: str, meta: dict, dirpath: Path, chapters):
        self.slug = slug; self.dirpath = dirpath
        self.title = meta.get("title", slug.replace("-", " ").title())
        self.alt_titles = meta.get("alt_titles", [])
        self.author = meta.get("author", "Unknown")
        self.artist = meta.get("artist", meta.get("author", "Unknown"))
        self.description = meta.get("description", "")
        self.tags = meta.get("tags", [])
        self.status = meta.get("status", "Ongoing")
        self.cover = meta.get("cover", "cover.jpg")
        self.chapters = chapters  # ASC by number

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

# --------- load manifest ---------
def load_updated_manifest() -> dict:
    """
    Returns { manga_slug: { chapter_slug: ISO8601 str } }
    """
    try:
        with UPDATED_MANIFEST.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
            # ensure dicts
            if not isinstance(data, dict): return {}
            return {str(k): (v or {}) for k, v in data.items()}
    except FileNotFoundError:
        return {}
    except Exception:
        return {}

# --------- scanner cache ---------
MANGAS = {}
LAST_SCAN = 0
SCAN_INTERVAL = 10  # seconds

def scan_content():
    """Scan ./content and apply updated times from manifest."""
    global MANGAS, LAST_SCAN
    now = time.time()
    if now - LAST_SCAN < SCAN_INTERVAL and MANGAS:
        return MANGAS

    manifest = load_updated_manifest()

    mangas = {}
    CONTENT_DIR.mkdir(parents=True, exist_ok=True)

    for mdir in sorted(CONTENT_DIR.iterdir()):
        if not mdir.is_dir(): continue
        slug = mdir.name
        if slug.startswith("_"):   # skip internal folders like _updated.yml's folder
            continue

        # metadata
        meta = {}
        mp = mdir / "manga.yml"
        if mp.exists():
            with mp.open("r", encoding="utf-8") as f:
                meta = yaml.safe_load(f) or {}

        chapters = []
        for cdir in sorted([p for p in mdir.iterdir() if p.is_dir()]):
            # images in this chapter
            img_paths = sorted(
                Path(p) for p in glob.glob(str(cdir / "*"))
                if p.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif"))
            )
            if not img_paths:
                continue

            # pages
            pages = [Page(path=img, index=i) for i, img in enumerate(img_paths, start=1)]

            # fallback timestamps (dir mtime)
            try:
                dir_ts = datetime.fromtimestamp(cdir.stat().st_mtime)
            except Exception:
                dir_ts = datetime.min

            # manifest time, if present
            m_manga = manifest.get(slug, {})
            updated = parse_iso(m_manga.get(cdir.name))

            # if manifest missing, fallback to newest file mtime
            if updated == datetime.min:
                try:
                    newest = max(p.stat().st_mtime for p in img_paths)
                    updated = datetime.fromtimestamp(newest)
                except Exception:
                    updated = dir_ts

            chapters.append(Chapter(slug=cdir.name, dirpath=cdir, pages=pages,
                                    updated=updated, timestamp=dir_ts))

        # sort chapters ascending by number, tie-break by updated then mtime
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
    start = (page - 1) * per_page
    end = start + per_page
    return items[start:end], page, pages, total

# ------------ routes ------------
@app.route("/")
def index():
    mangas = list(scan_content().values())

    q = request.args.get("q", "").strip().lower()
    tag = request.args.get("tag", "").strip().lower()

    if q:
        def match(m: Manga):
            hay = " ".join([m.title] + m.alt_titles + [m.author, m.artist, " ".join(m.tags)]).lower()
            return q in hay
        mangas = list(filter(match, mangas))

    if tag:
        mangas = [m for m in mangas if any(tag == t.lower() for t in m.tags)]

    # Sort by last updated desc using manifest timestamps
    mangas.sort(key=lambda m: m.updated, reverse=True)

    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 16))
    items, page, pages, total = paginate(mangas, page, per_page)

    all_tags = sorted({t for m in scan_content().values() for t in m.tags})

    return render_template(
        "index.html",
        mangas=items, page=page, pages=pages, total=total,
        q=q, tag=tag, all_tags=all_tags, naturaltime=naturaltime
    )

@app.route("/m/<slug>")
def manga_detail(slug):
    manga = scan_content().get(slug)
    if not manga:
        abort(404)
    chapters_desc = sorted(manga.chapters, key=lambda c: (c.updated, c.number), reverse=True)
    return render_template("manga_detail.html", manga=manga, chapters=chapters_desc, naturaltime=naturaltime)

@app.route("/m/<slug>/<chapter_slug>")
def reader(slug, chapter_slug):
    manga = scan_content().get(slug)
    if not manga:
        abort(404)

    chapters = manga.chapters  # ASC
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

# APIs
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

@app.route("/api/mangas/<slug>")
def api_manga_detail(slug):
    m = scan_content().get(slug)
    if not m:
        return jsonify({"error": "not found"}), 404
    return jsonify({
        "slug": m.slug,
        "title": m.title,
        "author": m.author,
        "artist": m.artist,
        "tags": m.tags,
        "status": m.status,
        "updated": m.updated.isoformat(),
        "chapters": [{
            "slug": c.slug,
            "pages": len(c.pages),
            "updated": c.updated.isoformat(),
        } for c in m.chapters],
    })

# Optional RSS
@app.route("/feed.xml")
def feed():
    mangas = scan_content()
    chapters = []
    for m in mangas.values():
        for c in m.chapters:
            chapters.append((m, c))
    chapters.sort(key=lambda mc: (mc[1].updated, mc[1].number), reverse=True)
    chapters = chapters[:30]

    updated = datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT")
    items = []
    for m, c in chapters:
        link = url_for("reader", slug=m.slug, chapter_slug=c.slug, _external=True)
        items.append(f"""
        <item>
          <title>{m.title} — {c.display_title}</title>
          <link>{link}</link>
          <guid isPermaLink="true">{link}</guid>
          <pubDate>{c.updated.strftime('%a, %d %b %Y %H:%M:%S GMT')}</pubDate>
          <description>{c.display_title} of {m.title}</description>
        </item>
        """)

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0"><channel>
      <title>Otaku Manga — Latest Chapters</title>
      <link>{request.url_root}</link>
      <description>Fresh chapters from your library.</description>
      <lastBuildDate>{updated}</lastBuildDate>
      {''.join(items)}
    </channel></rss>"""
    return xml, 200, {"Content-Type": "application/rss+xml; charset=utf-8"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
