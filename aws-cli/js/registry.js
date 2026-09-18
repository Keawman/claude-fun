/* Topic registry. Data files call AWSCHEAT.register({...}) — see README.md for the schema. */
(function () {
  'use strict';
  var registry = {
    topics: [],
    register: function (topic) {
      if (!topic || typeof topic !== 'object') throw new Error('AWSCHEAT.register: topic must be an object');
      if (!topic.id) throw new Error('AWSCHEAT.register: topic.id is required');
      if (registry.topics.some(function (t) { return t.id === topic.id; })) {
        throw new Error('AWSCHEAT.register: duplicate topic id "' + topic.id + '"');
      }
      registry.topics.push(topic);
      return topic;
    }
  };
  if (typeof window !== 'undefined') window.AWSCHEAT = registry;
  if (typeof module !== 'undefined' && module.exports) module.exports = registry;
})();
