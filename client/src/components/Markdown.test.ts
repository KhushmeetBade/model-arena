import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { latexToText, Markdown } from './Markdown';

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

describe('latexToText', () => {
  it('turns common LaTeX into readable text', () => {
    expect(latexToText(' x + (x + 1.00) = 1.10 ')).toBe('x + (x + 1.00) = 1.10');
    expect(latexToText('2x = 0.10 \\Rightarrow x = 0.05')).toBe('2x = 0.10 ⇒ x = 0.05');
    expect(latexToText('\\frac{a}{b} \\times 3')).toBe('(a)/(b) × 3');
    expect(latexToText('x^2 + y^{10}')).toBe('x² + y¹⁰');
    expect(latexToText('\\text{bat} = \\$1.05')).toBe('bat = $1.05');
    expect(latexToText('\\sqrt{2}')).toBe('√(2)');
  });
});

describe('Markdown', () => {
  it('renders the real race answer format (bold, lists, inline math) without raw syntax', () => {
    const out = html("Let's set up the problem algebraically:\n\n- Let the ball's cost = \\( x \\) dollars\n- Solving: \\( 2x = 0.10 \\)\n\n**Answer:** The ball costs **$0.05**.");
    expect(out).toContain('<ul class="md-ul">');
    expect(out).toContain('<span class="md-math">x</span>');
    expect(out).toContain('<strong>Answer:</strong>');
    expect(out).not.toMatch(/\\\(|\*\*/);
  });

  it('renders headings, numbered lists and code blocks', () => {
    const out = html('## Steps\n1. one\n2. two\n\n```js\nconst a = 1;\n```');
    expect(out).toContain('<div class="md-h">Steps</div>');
    expect(out).toContain('<ol class="md-ol"><li>one</li><li>two</li></ol>');
    expect(out).toContain('<pre class="md-pre">const a = 1;</pre>');
  });

  it('never injects HTML from model output', () => {
    const out = html('<img src=x onerror=alert(1)> **<script>alert(2)</script>**');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;img');
    expect(out).toContain('&lt;script&gt;');
  });
});
