"""GitHub 趋势榜：解析函数 + /api/trending 端点（不联网）。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from gitmon_api import config, trending
from gitmon_api.main import create_app

SAMPLE_HTML = """
<article class="Box-row">
  <h2 class="h3 lh-condensed">
    <a href="/facebook/react" data-view-component="true" class="Link">
      <span class="text-normal">facebook /</span>
      react</a>
  </h2>
  <p class="col-9 color-fg-muted my-1 tmp-pr-4">
    A declarative, efficient, and flexible JavaScript library for building user interfaces.
  </p>
  <div class="f6 color-fg-muted mt-2">
    <span class="tmp-mr-3 d-inline-block ml-0 tmp-ml-0">
      <span class="repo-language-color" style="background-color: #f1e05a"></span>
      <span itemprop="programmingLanguage">JavaScript</span>
    </span>
    <a href="/facebook/react/stargazers" class="Link Link--muted d-inline-block">
      <svg aria-label="star"></svg>
      230,123</a>
    <a href="/facebook/react/forks" class="Link Link--muted d-inline-block">
      <svg aria-label="fork"></svg>
      44,567</a>
    <span class="d-inline-block float-sm-right">
      <span class="color-fg-muted">1,234</span>
      stars this week
    </span>
  </div>
</article>
"""


def test_parse_trending_extracts_fields() -> None:
    items = trending.parse_trending(SAMPLE_HTML)
    assert len(items) == 1
    it = items[0]
    assert it["rank"] == 1
    assert it["author"] == "facebook"
    assert it["name"] == "react"
    assert it["full_name"] == "facebook/react"
    assert it["url"] == "https://github.com/facebook/react"
    assert it["language"] == "JavaScript"
    assert it["language_color"] == "#f1e05a"
    assert it["stars"] == 230123
    assert it["forks"] == 44567
    assert it["period_stars"] == 1234
    assert it["period_label"] == "本周新增"
    assert "declarative" in it["description"]


def test_parse_trending_no_language() -> None:
    html = (
        '<article class="Box-row"><h2 class="h3 lh-condensed">'
        '<a href="/a/b">a / b</a></h2>'
        '<p class="col-9 color-fg-muted my-1 tmp-pr-4">hi</p>'
        '<div class="f6 color-fg-muted mt-2">'
        '<a href="/a/b/stargazers"><svg></svg>12</a>'
        '<a href="/a/b/forks"><svg></svg>3</a></div></article>'
    )
    items = trending.parse_trending(html)
    assert items[0]["language"] == ""
    assert items[0]["stars"] == 12
    assert items[0]["forks"] == 3


def test_parse_trending_skip_login_only_articles() -> None:
    # 没有 h2 仓库链接的块（如 sponsor）应被跳过，不产出脏数据
    html = '<article class="Box-row"><div class="sponsor">promo</div></article>'
    assert trending.parse_trending(html) == []


@pytest.fixture()
def client(tmp_dir, monkeypatch):
    settings = config.settings
    monkeypatch.setattr(settings, "data_dir", tmp_dir)
    monkeypatch.setattr(settings, "static_dir", None)
    monkeypatch.setattr(settings, "rate_limit_per_min", 0)
    monkeypatch.setattr(settings, "cors_origins", [])
    settings.ensure_dirs()
    monkeypatch.setattr(
        trending,
        "fetch_trending",
        lambda since="weekly", language="": [
            {
                "rank": 1,
                "author": "facebook",
                "name": "react",
                "full_name": "facebook/react",
                "url": "https://github.com/facebook/react",
                "avatar": "https://github.com/facebook.png?size=40",
                "description": "React",
                "language": "JavaScript",
                "language_color": "#f1e05a",
                "stars": 230123,
                "forks": 44567,
                "period_stars": 1234,
                "period_label": "本周新增",
            },
        ],
    )
    app = create_app(start_queue=True)
    with TestClient(app) as test_client:
        yield test_client


def test_trending_endpoint(client: TestClient) -> None:
    r = client.get("/api/trending?since=weekly")
    assert r.status_code == 200
    d = r.json()
    assert d["since"] == "weekly"
    assert d["count"] == 1
    assert d["total"] == 1
    assert d["items"][0]["full_name"] == "facebook/react"


def test_trending_endpoint_language_and_limit(client: TestClient) -> None:
    r = client.get("/api/trending?since=daily&language=Python&limit=5")
    assert r.status_code == 200
    d = r.json()
    assert d["since"] == "daily"
    assert d["language"] == "Python"
    assert d["count"] == 1
