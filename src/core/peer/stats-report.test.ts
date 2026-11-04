import { describe, expect, it } from 'vitest';
import { connectedPath, type StatsEntry } from './stats-report';

const candidates: StatsEntry[] = [
  { id: 'L1', type: 'local-candidate', candidateType: 'host' },
  { id: 'L2', type: 'local-candidate', candidateType: 'srflx' },
  { id: 'R1', type: 'remote-candidate', candidateType: 'relay' },
  { id: 'R2', type: 'remote-candidate', candidateType: 'srflx' },
];

describe('connectedPath', () => {
  it('follows the pair that the transport names (Chromium)', () => {
    const reports: StatsEntry[] = [
      ...candidates,
      { id: 'P1', type: 'candidate-pair', localCandidateId: 'L1', remoteCandidateId: 'R1' },
      { id: 'P2', type: 'candidate-pair', localCandidateId: 'L2', remoteCandidateId: 'R2' },
      { id: 'T', type: 'transport', selectedCandidatePairId: 'P2' },
    ];

    expect(connectedPath(reports)).toBe('srflx/srflx');
  });

  it('follows the nominated pair where there is no transport report (Firefox)', () => {
    const reports: StatsEntry[] = [
      ...candidates,
      { id: 'P1', type: 'candidate-pair', localCandidateId: 'L1', remoteCandidateId: 'R1' },
      {
        id: 'P2',
        type: 'candidate-pair',
        nominated: true,
        localCandidateId: 'L2',
        remoteCandidateId: 'R1',
      },
    ];

    expect(connectedPath(reports)).toBe('srflx/relay');
  });

  it('is null while no pair is chosen', () => {
    const reports: StatsEntry[] = [
      ...candidates,
      { id: 'P1', type: 'candidate-pair', localCandidateId: 'L1', remoteCandidateId: 'R1' },
    ];

    expect(connectedPath(reports)).toBeNull();
    expect(connectedPath([])).toBeNull();
  });

  it('is null when a kind of the pair cannot be told', () => {
    const reports: StatsEntry[] = [
      { id: 'L1', type: 'local-candidate', candidateType: 'host' },
      {
        id: 'P',
        type: 'candidate-pair',
        nominated: true,
        localCandidateId: 'L1',
        remoteCandidateId: 'gone',
      },
    ];

    expect(connectedPath(reports)).toBeNull();
  });
});
