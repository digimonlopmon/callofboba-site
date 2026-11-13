/* Call of Boba site - recipe matcher (pure, shared by the page and tools/test_matcher.mjs).
 * Compares ingredient SETS only (never amounts). Ice and the cup are not ingredients.
 * Recipes whose sets are identical (in the shipped data: 纯香美式 hot / 冰美式 cold, both just coffee)
 * are told apart by the cup the drink is in: the first recipe of the group whose cup matches wins,
 * otherwise the first in menu order.
 */
(function (root) {
  'use strict';

  function key(ids) { return ids.slice().sort().join('|'); }

  function build(recipes) {
    var bySet = Object.create(null);
    var list = [];
    recipes.forEach(function (r, i) {
      if (!r.ings || !r.ings.length) return;          // ice cream: made at the machine, not mixable
      var k = key(r.ings);
      (bySet[k] = bySet[k] || []).push(r);
      list.push({ r: r, set: r.ings.slice(), order: i });
    });
    return { bySet: bySet, list: list };
  }

  /** Cup the drink ends up in: ice -> cold cup, coffee -> hot cup, otherwise the plastic cup. */
  function cupFor(ids, hasIce) {
    if (hasIce) return 'cold';
    if (ids.indexOf('Ingredient_0250') >= 0) return 'hot';
    return 'plastic';
  }

  function pick(group, cup) {
    for (var i = 0; i < group.length; i++) if (group[i].cup === cup) return group[i];
    return group[0];
  }

  /**
   * @param idx   result of build()
   * @param ids   ingredient ids in the cup (unique, any order, no ice)
   * @param cup   'plastic' | 'cold' | 'hot'
   * @returns {type:'exact', recipe} | {type:'near', recipe, missing:id} | {type:'near', recipe, extra:id}
   *          | {type:'none'} | {type:'empty'}
   */
  function match(idx, ids, cup) {
    if (!ids.length) return { type: 'empty' };
    var exact = idx.bySet[key(ids)];
    if (exact) return { type: 'exact', recipe: pick(exact, cup), group: exact.length };
    var have = Object.create(null);
    ids.forEach(function (i) { have[i] = 1; });
    var best = null;
    idx.list.forEach(function (e) {
      var missing = e.set.filter(function (i) { return !have[i]; });
      var extra = ids.filter(function (i) { return e.set.indexOf(i) < 0; });
      if (missing.length + extra.length !== 1) return;
      // rank: "missing one" before "one too many", then same cup, then menu order
      var score = (missing.length ? 0 : 10) + (e.r.cup === cup ? 0 : 1);
      if (!best || score < best.score || (score === best.score && e.order < best.order)) {
        best = { score: score, order: e.order, r: e.r, missing: missing[0], extra: extra[0] };
      }
    });
    if (!best) return { type: 'none' };
    var out = { type: 'near', recipe: best.r };
    if (best.missing) out.missing = best.missing; else out.extra = best.extra;
    return out;
  }

  var api = { build: build, match: match, cupFor: cupFor, key: key };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CobMatcher = api;
})(typeof window !== 'undefined' ? window : this);
