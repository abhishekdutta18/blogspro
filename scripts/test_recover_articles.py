"""Tests for recover_articles.py — run: python3 -m unittest scripts/test_recover_articles.py"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from recover_articles import clean_article_html, extract_body, page_title  # noqa: E402

PAGE = """<html><head><title>UPI vs Cards — BlogsPro</title></head><body>
<nav><a href="/">BlogsPro</a></nav>
<main class="article-wrap"><div class="article-meta-top">Fintech 18 March 2026</div>
<div class="article-content"><h2>Intro</h2><div><p>Nested <b>body</b></p></div></div>
<footer>Footer text</footer></main></body></html>"""

STAT_CHART = """<div class="bp-chart-block" style="background:#0c1322">
  <div style="margin-bottom:0.9rem"><div style="color:#c9a84c">Fig 2: Investments</div>
    <div>Infrastructure Development</div><div>In $ million</div></div>
  <div><div><span>Office Space</span><span>$125.6M</span></div><div><div style="width:40%"></div></div></div>
  <div><div><span>IT Infrastructure</span><span>$87.3M</span></div><div><div style="width:30%"></div></div></div>
  <div style="margin-top:0.8rem">Source: GIFT City authority, 2024</div>
</div>"""

BAR_CHART = """<div class="bp-chart-block">
  <div style="margin-bottom:0.9rem"><div>Fig 1: AI Chatbot Impact</div><div>Costs &amp; engagement</div><div>12-month uplift</div></div>
  <div style="display:flex;flex-wrap:wrap"><span><span style="background:#c9a84c"></span>Before AI</span><span>After AI</span></div>
  <div style="margin-bottom:0.9rem"><div>Service Cost per Query</div>
    <div style="display:flex"><span>Before AI</span><div><div style="width:2%"></div></div><span>1.25 $,%,min,%</span></div>
    <div style="display:flex"><span>After AI</span><div><div style="width:0%"></div></div><span>0.18 $,%,min,%</span></div></div>
  <div style="margin-top:0.8rem">Source: McKinsey 2024</div>
</div>"""

SVG_CHART = """<div class="bp-chart-block">
  <div style="margin-bottom:0.9rem"><div>Fig 1: Volume Index</div><div>Indexed to Oct-22</div><div>Policy effects</div></div>
  <svg width="560"><text x="1" y="2">0 Index</text><polyline points="1,2 3,4"/></svg>
  <div style="display:flex;flex-wrap:wrap"><span>UPI P2M</span><span>Card POS</span></div>
  <div>Source: RBI statistics</div>
</div>"""

TABLE_CHART = """<div class="bp-chart-block" style="margin:1.6rem 0"><table style="color:#f5f0e8">
  <caption style="font-weight:bold">Cards vs Loans</caption>
  <thead><tr><th style="border:1px">Parameter</th><th>Card</th></tr></thead>
  <tbody><tr><td style="border:1px">Ticket size</td><td>₹3–5 Lakh</td></tr></tbody></table></div>"""


class ExtractBodyTest(unittest.TestCase):
    def test_returns_only_article_content_including_nested_divs(self):
        body = extract_body(PAGE)
        self.assertIn('<h2>Intro</h2>', body)
        self.assertIn('Nested <b>body</b>', body)
        self.assertNotIn('Footer text', body)
        self.assertNotIn('18 March', body)

    def test_page_without_article_content_gives_none(self):
        self.assertIsNone(extract_body('<html><body><p>No body here</p></body></html>'))

    def test_page_title_drops_site_suffix(self):
        self.assertEqual(page_title(PAGE), 'UPI vs Cards')


class SanitizeTest(unittest.TestCase):
    def test_scripts_handlers_styles_and_unsafe_links_are_removed(self):
        html = clean_article_html(
            '<p style="color:#fff" onclick="steal()">Hi<script>alert(1)</script></p>'
            '<a href="javascript:alert(1)">bad</a><iframe src="https://x.test"></iframe>')
        self.assertEqual(html, '<p>Hi</p><a>bad</a>')

    def test_external_links_keep_href_and_get_safe_rel(self):
        html = clean_article_html('<a href="https://www.rbi.org.in/x" style="color:red" target="_self">RBI</a>')
        self.assertEqual(html, '<a href="https://www.rbi.org.in/x" rel="noopener noreferrer nofollow" target="_blank">RBI</a>')

    def test_unknown_and_malformed_tags_are_unwrapped_keeping_text(self):
        self.assertEqual(clean_article_html('<p><field>kept</field> <span style="x">too</span></p>'), '<p>kept too</p>')

    def test_text_is_escaped(self):
        self.assertEqual(clean_article_html('<p>5 &lt; 6 &amp; AT&amp;T</p>'), '<p>5 &lt; 6 &amp; AT&amp;T</p>')

    def test_svg_outside_charts_is_dropped(self):
        self.assertEqual(clean_article_html('<p>a</p><svg><text>tick</text></svg>'), '<p>a</p>')


class ChartTest(unittest.TestCase):
    def test_stat_chart_becomes_captioned_table_with_source(self):
        html = clean_article_html(STAT_CHART)
        self.assertTrue(html.startswith('<figure><figcaption><strong>Fig 2: Investments</strong>'))
        self.assertIn('<tr><td>Office Space</td><td>$125.6M</td></tr>', html)
        self.assertIn('<tr><td>IT Infrastructure</td><td>$87.3M</td></tr>', html)
        self.assertIn('<p><small>Source: GIFT City authority, 2024</small></p>', html)
        self.assertNotIn('style=', html)

    def test_bar_chart_uses_legend_as_columns_and_drops_unit_junk(self):
        html = clean_article_html(BAR_CHART)
        self.assertIn('<thead><tr><th></th><th>Before AI</th><th>After AI</th></tr></thead>', html)
        self.assertIn('<tr><td>Service Cost per Query</td><td>1.25</td><td>0.18</td></tr>', html)
        self.assertIn('Costs &amp; engagement', html)
        self.assertNotIn('$,%', html)

    def test_svg_chart_keeps_caption_legend_and_source_but_not_the_drawing(self):
        html = clean_article_html(SVG_CHART)
        self.assertIn('<strong>Fig 1: Volume Index</strong>', html)
        self.assertIn('could not be recovered', html)
        self.assertIn('UPI P2M', html)
        self.assertIn('Source: RBI statistics', html)
        self.assertNotIn('0 Index', html)
        self.assertNotIn('<svg', html)

    def test_table_chart_keeps_the_table_without_styles(self):
        html = clean_article_html(TABLE_CHART)
        self.assertIn('<caption>Cards vs Loans</caption>', html)
        self.assertIn('<th>Parameter</th>', html)
        self.assertIn('<td>₹3–5 Lakh</td>', html)
        self.assertNotIn('style=', html)


if __name__ == '__main__':
    unittest.main()
