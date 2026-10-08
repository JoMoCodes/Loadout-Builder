import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isOwnPage } from './senderCheck';

const pageFile = path.resolve('dist', 'renderer', 'index.html');
const packaged = { pageFile };
const dev = { devServerUrl: 'http://localhost:5173/' };

describe('is this the app’s own page?', () => {
  it('accepts the installed app’s page, with or without a query or a hash', () => {
    const url = pathToFileURL(pageFile).href;
    expect(isOwnPage(url, packaged)).toBe(true);
    expect(isOwnPage(`${url}?x=1#top`, packaged)).toBe(true);
  });

  it('refuses any other file, even next to it', () => {
    const other = pathToFileURL(path.resolve('dist', 'renderer', 'other.html')).href;
    expect(isOwnPage(other, packaged)).toBe(false);
    expect(isOwnPage(pathToFileURL(path.resolve('somewhere', 'index.html')).href, packaged)).toBe(
      false,
    );
  });

  it('refuses a web page in the installed app', () => {
    expect(isOwnPage('https://example.com/', packaged)).toBe(false);
    expect(isOwnPage('http://localhost:5173/', packaged)).toBe(false);
  });

  it('accepts only the dev server’s own address while developing', () => {
    expect(isOwnPage('http://localhost:5173/', dev)).toBe(true);
    expect(isOwnPage('http://localhost:5173/#/x', dev)).toBe(true);
    expect(isOwnPage('http://localhost:5174/', dev)).toBe(false);
    expect(isOwnPage('http://localhost.evil.test:5173/', dev)).toBe(false);
    expect(isOwnPage(pathToFileURL(pageFile).href, { ...dev, pageFile })).toBe(false);
  });

  it('refuses anything that is not an address', () => {
    for (const bad of [
      '',
      'not a url',
      undefined,
      null,
      5,
      {},
      'about:blank',
      'data:text/html,hi',
    ]) {
      expect(isOwnPage(bad, packaged)).toBe(false);
      expect(isOwnPage(bad, dev)).toBe(false);
    }
  });

  it('refuses everything when it has been told nothing', () => {
    expect(isOwnPage('file:///x/index.html', {})).toBe(false);
    expect(isOwnPage('http://localhost:5173/', {})).toBe(false);
  });
});
