import { afterEach, describe, expect, it } from 'vitest';
import { useLiveries } from '../store/useLiveries';
import { fitName, lineupLiveries, livery } from './livery';

const ID = 'openrouter:nvidia/nemotron-3.5-lightning:free';
const NAME = 'NVIDIA: Nemotron 3.5 Lightning';

afterEach(() => useLiveries.setState({ map: {}, version: 0 }));

describe('livery', () => {
  it('gives every model a stable factory car', () => {
    const a = livery(ID, NAME);
    expect(livery(ID, NAME)).toEqual(a);
    expect(a.callsign).toBe('NEMOTRON 3.5 LIGHTNING');
    expect(a.modelName).toBe('Nemotron 3.5 Lightning');
    expect(a.maker).toBe('NVIDIA');
    expect(a.number).toBeGreaterThanOrEqual(1);
    expect(a.number).toBeLessThanOrEqual(99);
    expect(a.customized).toBe(false);
  });

  it('applies saved colour, number, body style and nickname', () => {
    useLiveries.setState({ map: { [ID]: { color: '#ff7a1a', number: 7, chassis: 2, nickname: 'Night Owl' } } });
    const c = livery(ID, NAME);
    expect(c).toMatchObject({ primary: '#ff7a1a', number: 7, chassis: 2, chassisName: 'HALCYON', callsign: 'NIGHT OWL', modelName: 'Nemotron 3.5 Lightning', customized: true });
    expect(c.accent).not.toBe(c.primary);
  });

  it('looks identical in the Garage, on the race grid and in replays (no recolouring)', () => {
    const other = 'openrouter:baidu/ernie-5.5-flash-preview:free';
    useLiveries.setState({ map: { [ID]: { color: '#22e5ff' }, [other]: { color: '#22e5ff' } } });
    const grid = lineupLiveries([
      { modelId: ID, name: NAME },
      { modelId: other, name: 'Baidu: ERNIE-5.5-Flash-Preview' },
    ]);
    expect(grid[0]).toEqual(livery(ID, NAME));
    expect(grid[1]).toEqual(livery(other, 'Baidu: ERNIE-5.5-Flash-Preview'));
    expect(grid.map((g) => g.primary)).toEqual(['#22e5ff', '#22e5ff']);
  });

  it('previews unsaved Garage edits without touching saved ones', () => {
    useLiveries.setState({ map: { [ID]: { number: 7 } } });
    expect(livery(ID, NAME, { number: 42 }).number).toBe(42);
    expect(livery(ID, NAME).number).toBe(7);
    expect(livery(ID, NAME, {}).customized).toBe(false); // factory preview
  });
});

describe('fitName', () => {
  it('shortens long names at a word boundary instead of mid-word', () => {
    expect(fitName('ERNIE-5.5-FLASH-PREVIEW', 18)).toBe('ERNIE-5.5-FLASH…');
    expect(fitName('NEMOTRON 3 NANO OMNI', 16)).toBe('NEMOTRON 3 NANO…');
    expect(fitName('SHORT', 18)).toBe('SHORT');
  });
});
