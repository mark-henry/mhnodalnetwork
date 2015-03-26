(function () {

'use strict';

App.ApplicationSerializer = DS.RESTSerializer.extend({
  primaryKey: 'slug',
  normalizeHash: function(type, hash) {
    hash.id = hash.slug;
    return this._super(type, hash); 
  }
});

App.Node = DS.Model.extend({
  name: DS.attr('string'),
  desc: DS.attr('string'),
  adjacencies: DS.hasMany('node', {async: true})
});

App.Graph = DS.Model.extend({
  name: DS.attr('string'),
  nodes: DS.hasMany('node', {async: true})
});

})();