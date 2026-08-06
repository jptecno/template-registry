import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { reportFindings } from '../scripts/danger/report-findings.mjs';

describe('reportFindings', () => {
  it('encaminha finding objetivo para fail como bloqueante', () => {
    const fail = mock.fn();
    const warn = mock.fn();

    reportFindings(
      { failures: ['Título inválido.'], warnings: [] },
      { fail, warn },
    );

    assert.deepEqual(fail.mock.calls[0].arguments, ['Título inválido.']);
    assert.equal(warn.mock.callCount(), 0);
  });

  it('encaminha warning para warn sem bloquear', () => {
    const fail = mock.fn();
    const warn = mock.fn();

    reportFindings(
      { failures: [], warnings: ['PR grande.'] },
      { fail, warn },
    );

    assert.deepEqual(warn.mock.calls[0].arguments, ['PR grande.']);
    assert.equal(fail.mock.callCount(), 0);
  });
});
