import { reportEmail } from '../reports';

describe('report email', () => {
  it('describes the report and escapes what users typed', () => {
    const { subject, html } = reportEmail({
      id: 'r1', created_at: '2026-11-05T19:30:00Z', target_type: 'comment', reason: 'Abusive <b>language</b>',
      reporter: '@sam', target: '“you’re useless” by @jordan', group: 'Wednesday Football',
    });
    expect(subject).toBe('MATCHDAY report: comment reported by @sam');
    expect(html).toContain('Abusive &lt;b&gt;language&lt;/b&gt;');
    expect(html).toContain('Wednesday Football');
    expect(html).toContain('r1');
  });
});
