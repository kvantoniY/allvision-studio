import { readInputUrl } from '../blocks/utils';

describe('readInputUrl', () => {
  it.each([
    ['string input', 'https://example.com/foo.png', 'https://example.com/foo.png'],
    ['object url', { url: 'https://example.com/url.png' }, 'https://example.com/url.png'],
    ['object imageUrl', { imageUrl: 'https://example.com/image-url.png' }, 'https://example.com/image-url.png'],
    ['object inputImages', { inputImages: ['https://example.com/input-1.png'] }, 'https://example.com/input-1.png'],
    ['object photo', { photo: 'https://example.com/photo.png' }, 'https://example.com/photo.png'],
    ['undefined input', undefined, 'mock://input.jpg'],
    ['null input', null, 'mock://input.jpg'],
    ['number input', 42, 'mock://input.jpg'],
  ])('reads %s', (_label, input, expected) => {
    expect(readInputUrl(input)).toBe(expected);
  });
});
