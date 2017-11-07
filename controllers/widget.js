var GOOGLEAPIKEY = "AIzaSyBp-IG4fFws3GxWrp69XnlS5nsfF44oWTo";
var CURRENT_ADDRESS = {};
var TiMap = require('ti.map');

(function constructor(args) {
    if (args.input) $.input.applyProperties(args.input);
    $.acceptBtn.enabled = false;
    $.acceptBtn.opacity = 0.5;

    setUpAutocompleteForm();
    handleSuggestionPanelEvents();
})(arguments[0] || {});

/* --------------- HANDLE USER INTERACTIONS --------------- */

function close(e) {
    $.win.close();
}

function onInputFocus(e) {
    $.input = e.source;
    $.suggestions.itemClickEvent = false;
    handleInputEvents();
}

function onInputBlur(e) {
    $.input.removeEventListener('change', inputChange);
}

function handleInputEvents(e) {
    $.input.addEventListener('change', inputChange);
}

function onAcceptBtnClick(e) {
    $.trigger('submit', { address: CURRENT_ADDRESS });
    close();
}

/* --------------- MAP EVENTS --------------- */

$.map.addEventListener('regionchanged', function(e){
    $.input.blur();
});

$.map.addEventListener('pinchangedragstate', function(e){
    if (e.newState === TiMap.ANNOTATION_DRAG_STATE_END) {
        Titanium.Geolocation.reverseGeocoder(e.annotation.latitude, e.annotation.longitude,
            function (revGeoResponse) {
                e.annotation.data = revGeoResponse.places[0];

                if (revGeoResponse.places[0].address) {

                    // FIXME
                    CURRENT_ADDRESS.title = revGeoResponse.places[0].address;
                    CURRENT_ADDRESS.geometry.location.lat = revGeoResponse.places[0].latitude;
                    CURRENT_ADDRESS.geometry.location.lng = revGeoResponse.places[0].longitude;
                    $.pin.title = CURRENT_ADDRESS.title;

                    $.input.value = revGeoResponse.places[0].address;
                    $.acceptBtn.enabled = true;
                    $.acceptBtn.opacity = 1;
                }
            }
        );
    }
    else if (e.newState === TiMap.ANNOTATION_DRAG_STATE_START) {
        $.acceptBtn.enabled = false;
        $.acceptBtn.opacity = 0.5;
    }
});

/* --------------- EMBEDDED METHODS --------------- */

function handleSuggestionPanelEvents() {
    $.suggestions.addEventListener('dragstart', function(e) {
        $.input.blur();
    });

    $.suggestions.addEventListener('itemclick', function(e) {
        $.suggestions.itemClickEvent = true;
        var item = e.section.getItemAt(e.itemIndex);
        $.input.value = item.title.text;

        CURRENT_ADDRESS = item.data;
        getGeocoderFromGoogleReferenceId(item.data.reference, function(geometry) {
            // FIXME
            CURRENT_ADDRESS.geometry = geometry;

            // add pin
            $.pin = TiMap.createAnnotation({
                draggable: true,
                latitude: geometry.location.lat,
                longitude: geometry.location.lng,
                pincolor: TiMap.ANNOTATION_RED,
                title: CURRENT_ADDRESS.title,
            });

            $.map.addAnnotation($.pin);
        });

        hideSuggestionPanel();
        $.input.blur();

        $.acceptBtn.enabled = true;
        $.acceptBtn.opacity = 1;
    });
}

function hideSuggestionPanel() {
    $.suggestions.opacity = 0;
    $.suggestions.visible = false;
    $.suggestions.height = 0;
    $.input.blur();
}

function setSuggestions(data) {
    var isValidated = true;
    _.each(data, function(item) {
        if (!item.title) {
            console.error(item);
            Ti.API.error('Item should have title property');
            isValidated = false;
            if (item == data[0]) {
                item.title = 'Dirección Primaria';
                isValidated = true;
            }
        }
    });
    isValidated && $.section.setItems(_.map(data, function(item) {
        return {
            title : {
                text : item.title
            },
            leftIcon : {
                borderColor : $.input.id === "destination" ? "#7ED321" : "#D0021B"
            },
            data : item
        };
    }));
}


/* --------------- CONNECT AUTOCOMPLETE FIELD TO GOOGLE API --------------- */

function setUpAutocompleteForm(e) {
    var _url = 'https://maps.googleapis.com/maps/api/place/autocomplete/json?';
    // GOOGLE APIS
    // https://developers.google.com/places/web-service/autocomplete
    _url += [
        'types=establishment|geocode',
        'sensor=true',
        'components=country:pr',
        'language=es',
        'key=' + GOOGLEAPIKEY,
        'input={{input}}'
    ].join('&');

    setHTTPClient({
        url : _url
    }, function(respData){
        setSuggestions(transformData(respData));
    })
}

function getGeocoderFromGoogleReferenceId(reference, callback) {
    var _url = 'https://maps.googleapis.com/maps/api/place/details/json?';
    _url += [
        'types=establishment|geocode',
        'sensor=true',
        'components=country:pr',
        'language=es',
        'key=' + GOOGLEAPIKEY,
        'reference=' + reference
    ].join('&');

    var client = Ti.Network.createHTTPClient({
        // function called when the response data is available
        onload : function(e) {
            if (this.responseText) {
                try {
                    var respData = JSON.parse(this.responseText);
                    callback && callback(respData.result.geometry || {});
                } catch(err) {
                    Ti.API.info(this.responseText);
                    Ti.API.error(err);
                }
            }
        },
        // function called when an error occurs, including a timeout
        onerror : function(e) {
            Ti.API.error(e);
        },
        timeout : 10000  // in milliseconds
    });

    // Prepare the connection.
    client.open('GET', _url);

    // Send the request.
    client.send();
}

function setHTTPClient(args, callback) {
    if (!args.url) {
        Ti.API.error('Please provide URL');
        return false;
    }

    $.url = args.url;
    $.client = Ti.Network.createHTTPClient(_.extend({
        // function called when the response data is available
        onload : function(e) {
            if (this.responseText) {
                try {
                    var respData = JSON.parse(this.responseText);
                    callback(respData);
                } catch(e) {
                    Ti.API.info(this.responseText);
                    Ti.API.error(e);
                }
            }
        },
        // function called when an error occurs, including a timeout
        onerror : function(e) {
            Ti.API.error(e);
        },
        timeout : 10000  // in milliseconds
    }, _.omit(args.opts, 'onload', 'onerror')));
}

function inputChange(e) {
    if ($.suggestions.itemClickEvent == false) {
        $.suggestions.visible = !!e.value;
        $.suggestions.height = $.suggestions.visible ? Ti.UI.SIZE : 0;
        $.suggestions.visible && !$.suggestions.opacity && ($.suggestions.opacity = 1);
        if ($.suggestions.visible) {
            // Cancels a pending request.
            $.client.abort();

            // Prepare the connection.
            $.client.open('GET', $.url.replace('{{input}}', e.value));

            // Send the request.
            $.client.send();
        }
    } else {
        $.suggestions.itemClickEvent = false;
    }
}

function transformData(data) {
    if (!data || data.status !== 'OK') return [];

    return _.map(data.predictions, function (prediction) {

        // title is the property which used to populate data for suggestions
        // title is mandatory
        prediction.title = prediction.description;
        delete prediction.description;

        return prediction;
    })
}

/* --------------- CLEANUP --------------- */

function cleanup() {
    // Remove all event listeners via 'addListener' in the controller or in XML
    $.removeListener();

    // Remove all event listeners via 'on' in the controller
    $.off();

    // Let Alloy clean up listeners to global collections for data-binding
    // always call it since it'll just be empty if there are none
    $.destroy();
}
