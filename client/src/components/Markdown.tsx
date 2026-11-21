import { Fragment, type ReactNode } from 'react';

/**
 * Minimal, safe Markdown + inline-LaTeX renderer for model answers.
 * Builds React elements only (never sets raw HTML), so model output cannot inject markup.
 * Supports: headings, bullet/numbered lists, fenced code, blockquotes, **bold**, *italic*, `code`,
 * and \( … \) / \[ … \] / $$ … $$ math rendered as readable text (×, ÷, √, fractions, sub/superscripts).
 */

const SYMBOLS: Record<string, string> = {
  times: '×', cdot: '·', div: '÷', pm: '±', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈',
  infty: '∞', rightarrow: '→', to: '→', Rightarrow: '⇒', leftarrow: '←', implies: '⇒', pi: 'π', theta: 'θ', alpha: 'α',
  beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', lambda: 'λ', mu: 'μ', sigma: 'σ', sum: '∑', prod: '∏', int: '∫',
  quad: ' ', qquad: '  ', ldots: '…', dots: '…', cdots: '⋯', circ: '°', degree: '°', log: 'log', ln: 'ln', sin: 'sin', cos: 'cos',
};

/** Turns common LaTeX into plain readable text. */
export function latexToText(src: string): string {
  let s = src;
  for (let i = 0; i < 4; i++) {
    s = s
      .replace(/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
      .replace(/\\(?:text|mathrm|mathbf|operatorname|boxed)\s*\{([^{}]*)\}/g, '$1');
  }
  s = s
    .replace(/\\left|\\right/g, '')
    .replace(/\\([a-zA-Z]+)/g, (m, name: string) => SYMBOLS[name] ?? m.slice(1))
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\\$/g, '$')
    .replace(/\^\{([^{}]*)\}/g, (_, x: string) => toSup(x))
    .replace(/\^(\w)/g, (_, x: string) => toSup(x))
    .replace(/_\{([^{}]*)\}/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', n: 'ⁿ', x: 'ˣ' };
const toSup = (x: string) => ([...x].every((c) => SUP[c]) ? [...x].map((c) => SUP[c]).join('') : `^(${x})`);

const INLINE = /(\\\((.+?)\\\)|\$\$(.+?)\$\$|\\\[(.+?)\\\]|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*)/g;

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    const math = m[2] ?? m[3] ?? m[4];
    if (math !== undefined) out.push(<span key={k} className="md-math">{latexToText(math)}</span>);
    else if (m[5] !== undefined) out.push(<code key={k} className="md-code">{m[5]}</code>);
    else if (m[6] !== undefined || m[7] !== undefined) out.push(<strong key={k}>{inline(m[6] ?? m[7], k)}</strong>);
    else if (m[8] !== undefined) out.push(<em key={k}>{inline(m[8], k)}</em>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: string[] | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(' '), `p${blocks.length}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    const k = `l${blocks.length}`;
    blocks.push(
      <Tag key={k} className={list.ordered ? 'md-ol' : 'md-ul'}>
        {list.items.map((it, j) => (
          <li key={j}>{inline(it, `${k}-${j}`)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (code) {
      if (/^\s*```/.test(line)) {
        blocks.push(<pre key={`c${blocks.length}`} className="md-pre">{code.join('\n')}</pre>);
        code = null;
      } else code.push(raw);
      continue;
    }
    if (/^\s*```/.test(line)) {
      flushPara();
      flushList();
      code = [];
      continue;
    }
    const display = line.match(/^\s*(?:\\\[|\$\$)(.*?)(?:\\\]|\$\$)\s*$/);
    if (display) {
      flushPara();
      flushList();
      blocks.push(<div key={`m${blocks.length}`} className="md-math md-display">{latexToText(display[1])}</div>);
      continue;
    }
    const h = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      flushList();
      blocks.push(<div key={`h${blocks.length}`} className="md-h">{inline(h[2], `h${blocks.length}`)}</div>);
      continue;
    }
    const li = line.match(/^\s*(?:([-*+•])|(\d+)[.)])\s+(.*)$/);
    if (li) {
      flushPara();
      const ordered = !!li[2];
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(li[3]);
      continue;
    }
    const q = line.match(/^\s*>\s?(.*)$/);
    if (q) {
      flushPara();
      flushList();
      blocks.push(<blockquote key={`q${blocks.length}`} className="md-quote">{inline(q[1], `q${blocks.length}`)}</blockquote>);
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushPara();
      flushList();
      blocks.push(<hr key={`r${blocks.length}`} className="md-hr" />);
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    if (list) flushList();
    para.push(line.trim());
  }
  if (code) blocks.push(<pre key={`c${blocks.length}`} className="md-pre">{(code as string[]).join('\n')}</pre>);
  flushPara();
  flushList();
  return <div className={`md ${className}`}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
