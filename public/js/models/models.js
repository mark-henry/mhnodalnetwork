(function () {
'use strict';

NN.ApplicationSerializer = DS.RESTSerializer.extend({
  primaryKey: 'slug',
  normalizeHash: function(type, hash) {
    hash.id = hash.slug;
    return this._super(type, hash); 
  },
  serialize: function(snapshot, options) {
    var json = this._super(snapshot, options);
    // Ensure graph_slug is included if present on snapshot (needed for POST)
    if (snapshot.record.get('graph_slug')) { 
        json.graph_slug = snapshot.record.get('graph_slug');
    }
    return json;
  }
});

NN.Node = DS.Model.extend({
  // Note: Due to ApplicationSerializer configuration, id and slug are the same value.
  name: DS.attr('string'),
  desc: DS.attr('string'),
  adjacencies: DS.hasMany('node', { async: true, inverse: 'adjacencies'})
});

NN.Graph = DS.Model.extend({
  name: DS.attr('string'),
  nodes: DS.hasMany('node', { async: true })
});

})();