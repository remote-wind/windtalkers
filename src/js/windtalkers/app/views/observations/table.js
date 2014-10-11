"use strict";

var View = require('windtalkers/framework/view');
/**
 * @param {Object} options
 * @constructor
 */
function TableView(options){
    options = _.defaults(options || {}, {
        per_page: 20
    });
    /**
     * Bind event handlers for pagination
     * @param {jQuery} template
     * @returns {jQuery}
     */
    function paginate(template, options) {
        var observations = template.find('.observation');
        var pagination = template.find('.pagination');
        var per_page = options.per_page;

        // add page classes
        observations.each(function(i){
            $(this).addClass('page-' + Math.floor(i/per_page + 1));
        });
        // Mark first page as active
        template.find('.pagination li:first').addClass('active');
        template.find('.observation:not(.page-1)').addClass('hidden');

        // when clicking a page number
        pagination.on('click', '.page', function(){
            var on_page = $(this).attr('href').replace('#', '.');
            pagination.find('li').removeClass('active');
            $(this).parent().addClass('active');
            observations.filter(on_page).removeClass('hidden');
            observations.not(on_page).addClass('hidden');
            return false;
        });
        return template;
    }

    return TableView.prototype.create({
        options: options,
        render: function(view_data){
            var per_page = this.options.per_page;
            view_data = _.defaults(view_data, {
                per_page: per_page,
                pages: Math.ceil(view_data.observations.length / per_page)
            });
            return paginate( TableView.prototype.render(view_data), options )
        }
    })
}

module.exports = View.prototype.extend(View, TableView, {
    defaultTranslations: {
        created_at: 'Time',
        speed: 'Wind speed',
        direction: 'Direction'
    },
    template: _.template(
        '<table>' +
            '<legend class="station-name"><%= this.station.name %></legend>' +
            '<thead>' +
                '<tr>' +
                    '<td><%= t.created_at %></td>' +
                    '<td><%= t.speed %></td>' +
                    '<td><%= t.direction %></td>' +
                '</tr>' +
            '</thead>' +
            '<tbody>' +
                '<% _.each(this.observations, function(obs, index) { %>' +
                '<tr class="observation" >' +
                    "<td class='created-at'><%= obs.dateTime() %></td>" +
                    "<td class='wind-speed'><%= obs.windSpeed() %></td>" +
                    "<td class='direction'><%= obs.degreesAndCardinal() %></td>" +
                '</tr>'+
                '<% }); %>' +
            '</tbody>' +
        '</table>' +
        '<nav class="pages">' +
            '<ul class="pagination">' +
            '<% _.times(this.pages, function(page){ page++; %>' +
                '<li><a class="page" href="#page-<%= page %>"><%= page %></a></li>' +
            '<% }); %>' +
            '</ul>' +
        '</nav>'
    )
});