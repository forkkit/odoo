odoo.define('web.FormView', function (require) {
"use strict";

var BasicView = require('web.BasicView');
var config = require('web.config');
var Context = require('web.Context');
var core = require('web.core');
var FormController = require('web.FormController');
var FormRenderer = require('web.FormRenderer');

var _lt = core._lt;

var FormView = BasicView.extend({
    config: _.extend({}, BasicView.prototype.config, {
        Renderer: FormRenderer,
        Controller: FormController,
    }),
    display_name: _lt('Form'),
    icon: 'fa-edit',
    multi_record: false,
    withSearchBar: false,
    searchMenuTypes: [],
    viewType: 'form',
    /**
     * @override
     */
    init: function (viewInfo, params) {
        var hasActionMenus = params.hasActionMenus;
        this._super.apply(this, arguments);

        var mode = params.mode || (params.currentId ? 'readonly' : 'edit');
        this.loadParams.type = 'record';

        // this is kind of strange, but the param object is modified by
        // AbstractView, so we only need to use its hasActionMenus value if it was
        // not already present in the beginning of this method
        if (hasActionMenus === undefined) {
            hasActionMenus = params.hasActionMenus;
        }
        this.controllerParams.hasActionMenus = hasActionMenus;
        this.controllerParams.disableAutofocus = params.disable_autofocus;
        this.controllerParams.toolbarActions = viewInfo.toolbar;
        this.controllerParams.footerToButtons = params.footerToButtons;

        var defaultButtons = 'default_buttons' in params ? params.default_buttons : true;
        this.controllerParams.defaultButtons = defaultButtons;
        this.controllerParams.mode = mode;

        this.rendererParams.mode = mode;
        this.rendererParams.isFromFormViewDialog = params.isFromFormViewDialog;
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    getController: function (parent) {
        return this._loadSubviews(parent).then(this._super.bind(this, parent));
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _extractParamsFromAction: function (action) {
        var params = this._super.apply(this, arguments);
        var inDialog = action.target === 'new';
        var inline = action.target === 'inline';
        var fullscreen = action.target === 'fullscreen';
        params.withControlPanel = !(inDialog || inline);
        params.footerToButtons = inDialog;
        params.hasSearchView = inDialog ? false : params.hasSearchView;
        params.hasActionMenus = !inDialog && !inline;
        params.searchMenuTypes = inDialog ? [] : params.searchMenuTypes;
        if (inDialog || inline || fullscreen) {
            params.mode = 'edit';
        } else if (action.context && action.context.form_view_initial_mode) {
            params.mode = action.context.form_view_initial_mode;
        }
        return params;
    },
    /**
     * Loads the subviews for x2many fields when they are not inline
     *
     * @private
     * @param {Widget} parent the parent of the model, if it has to be created
     * @returns {Promise}
     */
    _loadSubviews: function (parent) {
        var self = this;
        var defs = [];
        if (this.loadParams && this.loadParams.fieldsInfo) {
            var fields = this.loadParams.fields;

            _.each(this.loadParams.fieldsInfo.form, function (attrs, fieldName) {
                var field = fields[fieldName];
                if (!field) {
                    // when a one2many record is opened in a form view, the fields
                    // of the main one2many view (list or kanban) are added to the
                    // fieldsInfo of its form view, but those fields aren't in the
                    // loadParams.fields, as they are not displayed in the view, so
                    // we can ignore them.
                    return;
                }
                if (field.type !== 'one2many' && field.type !== 'many2many') {
                    return;
                }

                if (attrs.Widget.prototype.useSubview && !attrs.__no_fetch && !attrs.views[attrs.mode]) {
                    var context = {};
                    var regex = /'([a-z]*_view_ref)' *: *'(.*?)'/g;
                    var matches;
                    while (matches = regex.exec(attrs.context)) {
                        context[matches[1]] = matches[2];
                    }

                    // Remove *_view_ref coming from parent view
                    var refinedContext = _.pick(self.loadParams.context, function (value, key) {
                        return key.indexOf('_view_ref') === -1;
                    });
                    // Specify the main model to prevent access rights defined in the context
                    // (e.g. create: 0) to apply to subviews. We use here the same logic as
                    // the one applied by the server for inline views.
                    refinedContext.base_model_name = self.controllerParams.modelName;
                    defs.push(parent.loadViews(
                            field.relation,
                            new Context(context, self.userContext, refinedContext).eval(),
                            [[null, attrs.mode === 'tree' ? 'list' : attrs.mode]])
                        .then(function (views) {
                            for (var viewName in views) {
                                // clone to make runbot green?
                                attrs.views[viewName] = self._processFieldsView(views[viewName], viewName);
                                attrs.views[viewName].fields = attrs.views[viewName].viewFields;
                                self._processSubViewAttrs(attrs.views[viewName], attrs);
                            }
                            self._setSubViewLimit(attrs);
                        }));
                } else {
                    self._setSubViewLimit(attrs);
                }
            });
        }
        return Promise.all(defs);
    },
    /**
     * We set here the limit for the number of records fetched (in one page).
     * This method is only called for subviews, not for main views.
     *
     * @private
     * @param {Object} attrs
     */
    _setSubViewLimit: function (attrs) {
        var view = attrs.views && attrs.views[attrs.mode];
        var limit = view && view.arch.attrs.limit && parseInt(view.arch.attrs.limit, 10);
        attrs.limit = limit || attrs.Widget.prototype.limit || 40;
    },
});

return FormView;

});
