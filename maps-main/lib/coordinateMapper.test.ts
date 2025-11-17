import { lngLatToSvg, VIEWBOX } from './coordinateMapper';

test('QVB falls within viewBox', () => {
  const p = lngLatToSvg(151.2067, -33.8718);
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.x).toBeLessThanOrEqual(VIEWBOX.width);
  expect(p.y).toBeGreaterThanOrEqual(0);
  expect(p.y).toBeLessThanOrEqual(VIEWBOX.height);
});
