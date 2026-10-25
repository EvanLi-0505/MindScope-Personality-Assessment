import { describe, expect, it } from 'vitest';
import { renderSafeMarkdown } from './markdown';
import { checkBaseUrl } from './config';

describe('safe markdown', () => {
  it('renders headings, lists, bold and paragraphs', () => {
    const html = renderSafeMarkdown('## 分析依据\n\n根据 **3 次**测评。\n\n- 第一点\n- 第二点\n\n1. 甲\n2. 乙');
    expect(html).toBe(
      '<h3>分析依据</h3>\n<p>根据 <strong>3 次</strong>测评。</p>\n<ul><li>第一点</li><li>第二点</li></ul>\n<ol><li>甲</li><li>乙</li></ol>',
    );
  });

  it('never outputs HTML, links or images from the input', () => {
    const attacks = [
      '<script>alert(1)</script>',
      '<img src=x onerror="alert(1)">',
      '[点我](javascript:alert(1))',
      '![x](https://evil.example/x.png)',
      '<a href="https://evil.example">x</a>',
      '**<b onmouseover=alert(1)>x</b>**',
      '"><svg onload=alert(1)>',
    ];
    for (const a of attacks) {
      const html = renderSafeMarkdown(a);
      // Only our own tags, and none of them has attributes.
      const tags = [...html.matchAll(/<\/?([a-z0-9]+)([^>]*)>/gi)];
      for (const [, name, attrs] of tags) {
        expect(['p', 'br', 'strong', 'ul', 'ol', 'li', 'h3', 'h4', 'h5', 'h6']).toContain(name!.toLowerCase());
        expect(attrs).toBe('');
      }
      // A browser parse finds no element besides the allowed ones.
      expect(html).not.toMatch(/<(script|img|a|svg|b)\b/i);
    }
  });

  it('keeps the text of links readable instead of dropping it', () => {
    expect(renderSafeMarkdown('[点我](javascript:x)')).toBe('<p>[点我](javascript:x)</p>');
  });
});

describe('provider address rules (same as the desktop shell)', () => {
  it('accepts https and local http only', () => {
    expect(checkBaseUrl('https://dashscope.aliyuncs.com/compatible-mode/v1')).toBeNull();
    expect(checkBaseUrl('http://127.0.0.1:11434/v1')).toBeNull();
    expect(checkBaseUrl('http://localhost:8080/v1')).toBeNull();
    expect(checkBaseUrl('http://example.com/v1')).toBe('http');
    expect(checkBaseUrl('ftp://x/v1')).toBe('scheme');
    expect(checkBaseUrl('https://u:p@x.com/v1')).toBe('extras');
    expect(checkBaseUrl('https://x.com/v1?a=1')).toBe('extras');
    expect(checkBaseUrl('nope')).toBe('invalid');
  });
});
