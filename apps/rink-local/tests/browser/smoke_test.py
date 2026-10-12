"""Headless smoke test without network access. Requires Python Playwright and Chromium."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2] / 'web'
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 950})
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.set_content((ROOT / 'index.html').read_text(encoding='utf-8'))
    page.add_script_tag(content=(ROOT / 'app.js').read_text(encoding='utf-8'))
    assert page.locator('#homeScore').inner_text() == '3'
    page.locator('#goalNumbers button').filter(has_text='#17').click()
    page.locator('[data-special="assist1:None"]').click()
    page.locator('[data-special="assist2:None"]').click()
    page.locator('#reviewDraft').click()
    assert page.locator('#homeScore').inner_text() == '3', 'Draft must not score'
    page.locator('#modalEdit').click()
    page.locator('#reviewDraft').click()
    page.locator('#modalConfirm').click()
    assert page.locator('#homeScore').inner_text() == '4'
    assert page.evaluate('state.events.length') == 1
    page.locator('[data-team="away"][data-action="penalty"]').click()
    page.locator('#penNumbers button').filter(has_text='#22').click()
    page.locator('#penInfractions button').filter(has_text='Tripping').click()
    page.locator('#reviewDraft').click()
    page.locator('#modalConfirm').click()
    assert page.evaluate('state.events.length') == 2
    page.locator('#correctLast').click()
    page.locator('#goalNumbers button').filter(has_text='#8').click()
    page.locator('#reviewDraft').click()
    page.locator('#modalConfirm').click()
    assert page.locator('#homeScore').inner_text() == '4', 'Attribution correction must not change score'
    assert page.evaluate('state.events.length') == 3
    assert any(x['type']=='GOAL_ATTRIBUTION_CORRECTED' for x in page.evaluate('state.events'))
    assert any(x['type']=='CONFIRM_DIALOG_EDIT' for x in page.evaluate('state.actions'))
    assert not errors, errors
    page.screenshot(path=str(ROOT / 'scorekeeper-v0.5.png'), full_page=True)
    print('PASS: draft isolation, edit, confirm, penalty, correction, operator audit, no JS errors')
    browser.close()
