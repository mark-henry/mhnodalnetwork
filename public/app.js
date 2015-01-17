
App = Em.Application.create({
  LOG_TRANSITIONS: true
});

App.Router.reopen({
  location: 'auto'
});

DS.RESTAdapter.reopen({
  namespace: 'api'
});

App.Router.map(function() {
  this.resource('graph', {path: '/graph/:id'}, function() {
    this.resource('node', {path: '/node/:id'});
  });
});

App.Graph = DS.Model.extend({
  tile: DS.attr()
});

App.GraphRoute = Ember.Route.extend({
  model: function(params) {
    return this.store.find('graph', params.id);
  }
});

App.NodeRoute = Ember.Route.extend({
  model: function(params) {
    return {id: params.node_id};
  }
});