import { extractLinkedParentJID } from './whatsapp-web-js.adapter';

describe('extractLinkedParentJID (#201)', () => {
  it('returns null when no metadata is provided', () => {
    expect(extractLinkedParentJID()).toBeNull();
    expect(extractLinkedParentJID({})).toBeNull();
  });

  it('reads a string candidate directly', () => {
    expect(extractLinkedParentJID({ parentGroup: '120363000@g.us' })).toBe('120363000@g.us');
  });

  it('reads the _serialized field of a Wid candidate', () => {
    expect(extractLinkedParentJID({ parentGroup: { _serialized: '120363111@g.us' } })).toBe('120363111@g.us');
  });

  it('returns null when a Wid candidate has no _serialized', () => {
    expect(extractLinkedParentJID({ parentGroup: {} })).toBeNull();
  });

  it('prefers parentGroup, then linkedParentGroup, then linkedParent', () => {
    expect(
      extractLinkedParentJID({
        parentGroup: 'a@g.us',
        linkedParentGroup: 'b@g.us',
        linkedParent: 'c@g.us',
      }),
    ).toBe('a@g.us');

    expect(extractLinkedParentJID({ linkedParentGroup: 'b@g.us', linkedParent: 'c@g.us' })).toBe('b@g.us');
    expect(extractLinkedParentJID({ linkedParent: 'c@g.us' })).toBe('c@g.us');
  });

  it('ignores null/undefined candidates and falls through to the next', () => {
    expect(extractLinkedParentJID({ parentGroup: null, linkedParentGroup: 'b@g.us' })).toBe('b@g.us');
  });
});
