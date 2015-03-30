(function () {
'use strict';

NN.NodeController = Ember.ObjectController.extend({
  needs: 'graph',
  onModelChange: function() {
    // Reach up to the graph-view and set which node is selected
    this.get('controllers.graph').set('selectedNode', this.get('model'));
  }.observes('model'),
  actions: {
    addLink: function(nodeToLinkTo) {
      this.get('adjacencies').pushObject(nodeToLinkTo);
      this.model.save();
    },
    deleteLink: function(link) {
      this.get('adjacencies').removeObject(link);
      this.model.save();
    },
    newNodeAndAddLink: function(nodeName) {
      var sourceNode = this.get('model');
      this.get('controllers.graph').createNewNode(nodeName)
        .then(function(newNode) {
          sourceNode.get('adjacencies').addObject(newNode);
        }
      );
    },
    deleteNode: function(node) {
      this.model.deleteRecord();
      this.model.save();
      this.transitionToRoute('graph', this.get('controllers.graph.model'));
    }
  },
  save: function() {
    if (this.get('isDirty')) {
      this.get('model').save();
    }
  },
  autoSave: function() {
    Ember.run.debounce(this, this.save, 1500);
  }.observes('name', 'desc')
});

})();