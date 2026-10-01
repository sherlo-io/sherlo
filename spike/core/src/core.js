// Sherlo core - the readable source. It never ships like this: build-core.js turns it into the
// sealed sherlo-core.js. In the real build this file lives in a private repository.
//
// It installs one global, __SHERLO_CORE__, which the public SDK calls into. It imports nothing:
// no React, no React Native - it is plain logic the SDK hands data to.
(function () {
  var VERSION = '__SHERLO_CORE_VERSION__';
  var SEAM = 1;
  // A build flag, so two versions of the core really behave differently in the spike.
  var KNOWS_NESTED_STORY_PAYLOAD = '__SHERLO_CORE_FIX__' === 'yes';

  /**
   * Storybook core emits STORY_RENDERED with a string id, or an object carrying the id.
   * The fixed core also understands { story: { id } }.
   */
  function extractStoryId(args) {
    var first = args && args[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') {
      if (first.storyId) return first.storyId;
      if (first.id) return first.id;
      if (KNOWS_NESTED_STORY_PAYLOAD && first.story && first.story.id) return first.story.id;
    }
    return undefined;
  }

  function describe() {
    return 'sherlo-core ' + VERSION + (KNOWS_NESTED_STORY_PAYLOAD ? ' (with fix)' : '');
  }

  globalThis.__SHERLO_CORE__ = {
    version: VERSION,
    seam: SEAM,
    extractStoryId: extractStoryId,
    describe: describe,
  };
})();
