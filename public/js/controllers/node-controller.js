(function () {
'use strict';

NN.NodeController = Ember.Controller.extend({
  needs: 'graph',
  onModelChange: function() {
    // Reach up for the graph-view and set which node is selected
    this.get('controllers.graph').set('selectedId', this.get('model').id);
  }.observes('model')
});

})();