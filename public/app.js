
App = Em.Application.create({
  LOG_TRANSITIONS: true
});

App.Router.map(function() {
  this.resource('graph', { path: '/graph/:graph_id' });
});

App.GraphRoute = Ember.Route.extend({
  model: function(params) {
    return { graph_id: params.graph_id };
  }
});

App.GraphController = Ember.ObjectController.extend({
  graph_id: function() {
    return this.get('model.graph_id');
  }.property('model.graph_id')
});