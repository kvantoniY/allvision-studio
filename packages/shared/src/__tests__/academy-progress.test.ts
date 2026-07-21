import { computeNextTopic, readTopicPrerequisites, type OrderedTopic } from '../academy/progress';

const linear: OrderedTopic[] = [
  { id: 't1', prerequisites: [] },
  { id: 't2', prerequisites: [] },
  { id: 't3', prerequisites: [] },
];

describe('computeNextTopic', () => {
  it('recommends the first topic when nothing is completed', () => {
    expect(computeNextTopic(linear, [])).toEqual({ topicId: 't1', allCompleted: false, blocked: false });
  });

  it('recommends the first non-completed topic in order', () => {
    expect(computeNextTopic(linear, ['t1']).topicId).toBe('t2');
    expect(computeNextTopic(linear, ['t1', 't2']).topicId).toBe('t3');
  });

  it('reports allCompleted when every topic is done', () => {
    expect(computeNextTopic(linear, ['t1', 't2', 't3'])).toEqual({
      topicId: null,
      allCompleted: true,
      blocked: false,
    });
  });

  it('skips a topic whose prerequisites are unmet and picks a ready one', () => {
    const topics: OrderedTopic[] = [
      { id: 'a', prerequisites: ['z'] }, // z не пройден → пропускаем
      { id: 'b', prerequisites: [] },
    ];
    expect(computeNextTopic(topics, []).topicId).toBe('b');
  });

  it('reports blocked when non-completed topics all have unmet prerequisites', () => {
    const topics: OrderedTopic[] = [{ id: 'a', prerequisites: ['missing'] }];
    expect(computeNextTopic(topics, [])).toEqual({ topicId: null, allCompleted: false, blocked: true });
  });

  it('unblocks a topic once its prerequisite is completed', () => {
    const topics: OrderedTopic[] = [
      { id: 'intro', prerequisites: [] },
      { id: 'advanced', prerequisites: ['intro'] },
    ];
    expect(computeNextTopic(topics, ['intro']).topicId).toBe('advanced');
  });

  it('handles an empty course', () => {
    expect(computeNextTopic([], [])).toEqual({ topicId: null, allCompleted: false, blocked: false });
  });
});

describe('readTopicPrerequisites', () => {
  it('reads a string array from content.prerequisites', () => {
    expect(readTopicPrerequisites({ prerequisites: ['t1', 't2'] })).toEqual(['t1', 't2']);
  });

  it('returns empty for missing/invalid content', () => {
    expect(readTopicPrerequisites(null)).toEqual([]);
    expect(readTopicPrerequisites({})).toEqual([]);
    expect(readTopicPrerequisites({ prerequisites: 'nope' })).toEqual([]);
    expect(readTopicPrerequisites({ prerequisites: [1, 't1', null] })).toEqual(['t1']);
  });
});
