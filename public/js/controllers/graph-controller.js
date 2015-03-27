(function () {
'use strict';

NN.GraphController = Ember.ObjectController.extend({
  actions: {
    selectNode: function(node) {
      this.transitionToRoute('node', node.id);
    },
    newNode: function(nodeName) {
      var _this = this;
      console.log('create node', nodeName);
      this.createNewNode(nodeName)
        .then(function(newNode) {
          _this.transitionToRoute('node', newNode.id);
        }
      );
    },
    addLink: function(node, nodeToLinkTo) {
      this.get('adjacencies').addObject(nodeToLinkTo);
      this.model.save();
    },
    deleteLink: function(link) {
      this.get('adjacencies').removeObject(link);
      this.model.save();
    },
    newNodeAnd

    : function(nodeName) {
      var sourceNode = this.get('model');
      this.createNewNode(nodeName)
        .then(function(newNode) {
          sourceNode.get('adjacencies').addObject(newNode);
        }
      );
    },
    deleteNode: function(node) {
      console.log('delete node', node.get('id'));
      this.get('nodes').removeObject(node);
      node.deleteRecord();
      this.model.save();

      this.transitionToRoute('node', this.get('nodes').objectAt(0));
    }
  },
  createNewNode: function(nodeName) {
    // Returns: promise for the new node
    var _this = this;
    return this.store.createRecord('node', { name: nodeName }).save()
      .then(function(newNode) {
          _this.get('nodes').addObject(newNode);
          _this.get('model').save();
          _this.model.save();
          return newNode;
        }
      );
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

NN.ModalDialogComponent = Ember.Component.extend({
  actions: {
    close: function() {
      this.$('.modal').modal('hide');
      this.sendAction('close');
    }
  },
  show: function() {
    this.$('.modal').modal().on('hidden.bs.modal', function() {
      this.sendAction('close');
    }.bind(this));
  }.on('didInsertElement')
});

})();