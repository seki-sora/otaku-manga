import glob
import re
import time
import yaml
from pathlib import Path
from datetime import datetime
from flask import Flask, render_template, send_from_directory, abort, request, url_for, jsonify
from humanize import naturaltime

# NEW: Markdown rendering for YAML description
import markdown as _md
from markupsafe import Markup, escape

BASE_DIR = Path(__file__).resolve().parent
CONTENT_DIR = BASE_DIR / "content"
STATIC_DIR = BASE_DIR / "static"

app = Flask(__name__, static_folder=str(STATIC_DIR), template_folder=str(BASE_DIR / "templates"))

@app.context_processor
def inject_datetime():
  return {"datetime": datetime}

# ---------- Jinja filters ----------
@app.template_filter('md')
def md_filter(text):
  """
  Render Markdown with preserved newlines and common extras.
  Use in templates: {{ manga.description | md }}
  """
  if not text:
    return ""
  html = _md.markdown(
      text,
      extensions=['extra', 'sane_lists', 'nl2br']
  )
  return Markup(html)

@app.template_filter('nl2br')
def nl2br(s: str):
  """If you switch off Markdown, you can use this to preserve line breaks."""
  if not s:
    return ""
  return Markup("<br>".join(escape(s).splitlines()))

# ------------ helpers ------------
def chapter_display_title(slug: str) -> str:
  s = slug.replace('_', '-').lower()
  m = re.search(r'(\d+(?:\.\d+)?)', s)
  if m:
    num = m.group(1)
    return f"Chapter {int(num) if num.isdigit() else num}"
  return slug.replace('-', ' ').title()

def chapter_num(slug: str) -> float:
  nums = re.findall(r'(\d+(?:\.\d+)?)', slug)
  if not nums: return float("inf")
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
  def __init__(self, slug: str, dirpath: Path, pages):
    self.slug = slug; self.dirpath = dirpath; self.pages = pages
    self.timestamp = datetime.fromtimestamp(dirpath.stat().st_mtime)
  @property
  def number(self): return chapter_num(self.slug)
  @property
  def display_title(self): return chapter_display_title(self.slug)

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
    self.chapters = chapters  # ascending by number

  @property
  def cover_url(self):
    rel = (self.dirpath / self.cover).relative_to(CONTENT_DIR)
    return url_for("serve_content", subpath=str(rel).replace("\\", "/"))

  @property
  def latest_chapter(self):
    return max(self.chapters, key=lambda c: (c.number, c.timestamp), default=None)

MANGAS = {}; LAST_SCAN = 0; SCAN_INTERVAL = 10

def scan_content():
  global MANGAS, LAST_SCAN
  now = time.time()
  if now - LAST_SCAN < SCAN_INTERVAL and MANGAS:
    return MANGAS

  mangas = {}
  CONTENT_DIR.mkdir(parents=True, exist_ok=True)

  for mdir in sorted(CONTENT_DIR.iterdir()):
    if not mdir.is_dir(): continue
    slug = mdir.name
    meta = {}
    meta_path = mdir / "manga.yml"
    if meta_path.exists():
      with meta_path.open("r", encoding="utf-8") as f:
        meta = yaml.safe_load(f) or {}

    chapters = []
    for cdir in sorted([p for p in mdir.iterdir() if p.is_dir()]):
      imgs = sorted(
        Path(p) for p in glob.glob(str(cdir / "*"))
        if p.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif"))
      )
      if not imgs: continue
      pages = [Page(path=img, index=i) for i, img in enumerate(imgs, start=1)]
      chapters.append(Chapter(slug=cdir.name, dirpath=cdir, pages=pages))

    chapters.sort(key=lambda c: (c.number, c.timestamp))     # ASC by chapter number
    mangas[slug] = Manga(slug=slug, meta=meta, dirpath=mdir, chapters=chapters)

  MANGAS = mangas; LAST_SCAN = now
  return mangas

def paginate(items, page, per_page=16):
  import math
  total = len(items); pages = max(1, math.ceil(total / per_page))
  page = max(1, min(page, pages)); s = (page-1)*per_page; e = s+per_page
  return items[s:e], page, pages, total

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

  mangas.sort(key=lambda m: (
      m.latest_chapter.timestamp if m.latest_chapter else datetime.min),
      reverse=True)

  page = int(request.args.get("page", 1))
  per_page = int(request.args.get("per_page", 16))
  items, page, pages, total = paginate(mangas, page, per_page)
  all_tags = sorted({t for m in scan_content().values() for t in m.tags})

  return render_template("index.html", mangas=items, page=page, pages=pages,
                         total=total, q=q, tag=tag, all_tags=all_tags,
                         naturaltime=naturaltime)

@app.route("/m/<slug>")
def manga_detail(slug):
  manga = scan_content().get(slug)
  if not manga: abort(404)
  chapters_desc = sorted(manga.chapters, key=lambda c: (c.number, c.timestamp), reverse=True)
  return render_template("manga_detail.html", manga=manga, chapters=chapters_desc, naturaltime=naturaltime)

@app.route("/m/<slug>/<chapter_slug>")
def reader(slug, chapter_slug):
  manga = scan_content().get(slug)
  if not manga: abort(404)

  chapters = manga.chapters  # ASC by number
  idx = next((i for i, c in enumerate(chapters) if c.slug == chapter_slug), None)
  if idx is None: abort(404)

  chapter = chapters[idx]
  prev_ch = chapters[idx-1] if idx > 0 else None
  next_ch = chapters[idx+1] if idx+1 < len(chapters) else None

  return render_template("reader.html", manga=manga, chapter=chapter, prev_ch=prev_ch, next_ch=next_ch)

@app.route("/content/<path:subpath>")
def serve_content(subpath):
  return send_from_directory(CONTENT_DIR, subpath)

# simple APIs
@app.route("/api/mangas")
def api_mangas():
  data = []
  for m in scan_content().values():
    data.append({
      "slug": m.slug, "title": m.title, "author": m.author, "tags": m.tags,
      "latest_chapter": m.latest_chapter.slug if m.latest_chapter else None,
    })
  return jsonify(data)

@app.route("/api/mangas/<slug>")
def api_manga_detail(slug):
  m = scan_content().get(slug)
  if not m: return jsonify({"error":"not found"}), 404
  return jsonify({
    "slug": m.slug, "title": m.title, "author": m.author, "artist": m.artist,
    "tags": m.tags, "status": m.status, "chapters": [c.slug for c in m.chapters],
  })

@app.route("/feed.xml")
def feed():
  mangas = scan_content()
  chapters = [(m, c) for m in mangas.values() for c in m.chapters]
  chapters.sort(key=lambda mc: (mc[1].number, mc[1].timestamp), reverse=True)
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
      <pubDate>{c.timestamp.strftime('%a, %d %b %Y %H:%M:%S GMT')}</pubDate>
      <description>{c.display_title} of {m.title}</description>
    </item>""")

  xml = f"""<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0"><channel>
    <title>Otaku Manga — Latest Chapters</title>
    <link>{request.url_root}</link>
    <description>Fresh chapters from your library.</description>
    <lastBuildDate>{updated}</lastBuildDate>
    {''.join(items)}
  </channel></rss>"""
  return xml, 200, {"Content-Type":"application/rss+xml; charset=utf-8"}

if __name__ == "__main__":
  app.run(debug=True)
