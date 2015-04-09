(function () {
'use strict';

NN.GraphController = Ember.ObjectController.extend({
  actions: {
    selectNode: function(node) {
      this.transitionToRoute('node', node.id);
    },
    newNode: function(nodeName) {
      var _this = this;
      this.createNewNode(nodeName)
        .then(function(newNode) {
          _this.transitionToRoute('node', newNode.id);
        }
      );
    },
  },
  selectedId: function() {
    return this.get('selectedNode.id');
  }.property('selectedNode'),
  createNewNode: function(nodeName) {
    // Returns: promise for the new node
    var _this = this;
    return this.store.createRecord('node', { name: nodeName }).save()
      .then(function(newNode) {
          _this.get('nodes').addObject(newNode);
          _this.model.save();
          return newNode;
        }
      );
  },
  hasDirty: function() {
    return this.get('nodes').isAny('isDirty', true);
  }.property('nodes.@each.isDirty')
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