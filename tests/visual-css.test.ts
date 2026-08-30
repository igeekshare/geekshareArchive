import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("cross-document navigation fades while the site header stays stable", () => {
  assert.match(css, /@view-transition\s*{\s*navigation:\s*auto;/);
  assert.match(css, /::view-transition-new\(root\)[\s\S]*?160ms/);
  assert.match(css, /\.site-header\s*{\s*view-transition-name:\s*site-header;/);
  assert.match(css, /::view-transition-group\(site-header\)[\s\S]*?animation:\s*none;/);
});

test("reduced motion removes cross-document animation", () => {
  const reducedMotion = css.match(/@media \(prefers-reduced-motion: reduce\)\s*{([\s\S]*?)\n}/)?.[1] ?? "";
  assert.match(reducedMotion, /scroll-behavior:\s*auto/);
  assert.match(reducedMotion, /::view-transition-old\(\*\)/);
  assert.match(reducedMotion, /animation-duration:\s*0s\s*!important/);
});

test("technical message content cannot widen narrow cards", () => {
  assert.match(css, /\.message-reading-body :not\(pre\) > code/);
  assert.match(css, /\.message-reading-body pre\s*{[\s\S]*?max-width:\s*100%/);
  assert.match(css, /\.message-reading-body pre\s*{[\s\S]*?overflow-x:\s*auto/);
  assert.match(css, /\.message-reading-body pre code\s*{[\s\S]*?white-space:\s*pre/);
  assert.match(css, /\.message-reading-body \.tg-rich-table-scroll\s*{[\s\S]*?max-width:\s*100%[\s\S]*?overflow-x:\s*auto/);
  assert.match(css, /\.message-reading-body \.tg-rich-math--block\s*{[\s\S]*?overflow-x:\s*auto/);
});
