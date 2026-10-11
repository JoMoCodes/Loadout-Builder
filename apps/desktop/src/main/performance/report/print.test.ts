import { describe, expect, it } from 'vitest';
import { PDF_OPTIONS } from './print';

describe('the PDF print settings', () => {
  it('prints on Letter pages with "Page X of Y" at the foot of each page', () => {
    expect(PDF_OPTIONS.pageSize).toBe('Letter');
    expect(PDF_OPTIONS.displayHeaderFooter).toBe(true);
    expect(PDF_OPTIONS.footerTemplate).toContain(
      'Page <span class="pageNumber"></span> of <span class="totalPages"></span>',
    );
  });
});
