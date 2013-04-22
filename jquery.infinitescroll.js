/*
 * --------------------------------
 * Infinite Scroll
 * --------------------------------
 * + modified by Spring MC
 * + https://github.com/paulirish/infinite-scroll
 * + version 3.0
 * + Copyright 2011/12 Paul Irish & Luke Shumard
 * + Licensed under the MIT license
 * + Documentation: http://infinite-scroll.com/
 */

(function (window, $, undefined) {

$.infinitescroll = function(options, callback, element) {
    this.element = $(element);

    // Flag the object in the event of a failed creation
    this.failed = false;
    if (this._create(options, callback)) {
        // hide default pagination element if exists
        var $nav = $(options.navSelector);
        if ($nav.size() > 0) {
            $nav.hide();
        }
    } else {
        this.failed = true;
    }
};

$.infinitescroll.defaults = {
    loading: {
        wrapperId: "infscr-loading",
        img: "http://www.infinite-scroll.com/loading.gif",
        msgText: "<em>Loading the next set of posts...</em>",
        finishedMsg: "<em>Congratulations, you've reached the end of the internet.</em>",
        msg: null,
        selector: null,
        start: undefined,
        finished: undefined,
        speed: 'fast'
    },
    state: {
        isDuringAjax: false,
        isPaused: false,
        isDone: false, // For when it goes all the way through the archive.
        isDestroyed: false,
        isInvalidPage: false,
        currPage: 1
    },
    infid: 0, //Instance ID
    binder: $(window), // used to cache the selector
    callback: undefined,
    behavior: undefined,
    forceCreate: false,
    fragSelector: null,
    itemSelector: "div.post",
    navSelector: "div.navigation",
    nextSelector: "div.navigation a:first",
    animate: false,
    dataType: 'html',
    autoAppended: true,
    errorCallback: $.noop,
    bufferPx: 40,
    distancePx: undefined,
    extraScrollPx: 150,
    path: undefined,
    pathParser: undefined,
    debug: false
};


$.infinitescroll.prototype = {

    Version: '3.0',

    // Bind to scroll
    bind: function() {
        this._binding('bind');
    },

    // Unbind from scroll
    unbind: function() {
        this._binding('unbind');
    },

    // Set pause value to false
    pause: function() {
        this._pausing('pause');
    },

    // Set pause value to false
    resume: function() {
        this._pausing('resume');
    },

    // Finish the scroll
    finish: function() {
        this._error('end');
    },

    // Toggle pause value
    toggle: function() {
        this._pausing();
    },

    // Retrieve next set of content items
    retrieve: function(page) {
        var instance = this,
            $box, $frag, url, method,
            opts = instance.options,
            path = opts.path, // path should be an array contains 2 elements at least, such as ['path/to/page/', ''] or ['path/to?page=', '']
            page = page || null;

        $frag = $(opts.fragSelector);
        if (!$frag) {
            return this._error('Can not find page fragment with `' + opts.fragSelector + '`');
        }

        if (!$.isArray(path)) {
            path = [path, ''];
        }

        // NOTE: this will create a global object
        infinitescroll_ajax = function(opts) {
            instance._debug('Heading into ajax', path);

            // increment the URL bit. e.g. /page/3
            opts.state.currPage++;

            // if we're dealing with a table we can't use DIVs
            $box = $frag.is('table') ? $('<tbody/>') : $('<div/>');

            url = path.join(page || opts.state.currPage);

            method = $.inArray(opts.dataType, ['json', 'html']) > -1 ? opts.dataType : 'html+callback';
            if (opts.autoAppended && opts.dataType == 'html') {
                method += '+callback';
            }

            switch (method) {
                case 'html+callback':
                    instance._debug('Using HTML via .load() method.');

                    $box.load(url + ' ' + opts.itemSelector, function (responseText) {
                        instance._loadcallback($box, responseText);
                    });
                    break;

                case 'html':
                    instance._debug('Using HTML via $.ajax() method.');

                    $.ajax({
                        url: url,
                        dataType: 'html',
                        complete: function (jqXHR, textStatus) {
                            instance._isXhrSuccess(textStatus, jqXHR) ? instance._loadcallback($box, jqXHR.responseText) : instance.finish();
                        }
                    });
                    break;

                case 'json':
                    instance._debug('Using JSON via $.ajax() method.');

                    $.ajax({
                        url: url,
                        type: 'GET',
                        dataType: 'json',
                        success: function(data, textStatus, jqXHR) {
                            if(opts.autoAppended) {
                                // if autoAppended is true, you must pass into template option.
                                // NOTE: data passed into _loadcallback is already an html (after processed in opts.template(data)).
                                if(typeof(opts.template) !== 'undefined') {
                                    var html = opts.template(data);
                                    $box.append(html);

                                    instance._isXhrSuccess(textStatus, jqXHR) ? instance._loadcallback($box, html) : instance.finish();
                                } else {
                                    instance._debug('options.template must be passed in when .autoAppended is true.');
                                    instance.finish();
                                }
                            } else {
                                // if autoAppended is false, we will pass in the JSON object. you should handle it yourself in callback.
                                instance._isXhrSuccess(textStatus, jqXHR) ? instance._loadcallback($box, data) : instance.finish();
                            }
                        },
                        error: function(jqXHR, textStatus, errorThrown) {
                            instance._debug('Ajax json request failed.');
                            instance.finish();
                        }
                    });
                    break;
            }
        };

        // if behavior is defined and this function is extended, call that instead of default
        if (!!opts.behavior && this['retrieve_'+opts.behavior] !== undefined) {
            return this['retrieve_'+opts.behavior].call(this, page || opts.state.currPage++);
        }

        // for manual triggers, if destroyed, get out of here
        if (opts.state.isDestroyed) {
            this._debug('Infinistescroll object has been destroyed.');
            return false;
        }

        // we dont want to fire the ajax multiple times
        opts.state.isDuringAjax = true;

        opts.loading.start.call($frag[0], opts);
    },

    // Check to see next page is needed
    scroll: function() {
        var opts = this.options,
            state = opts.state;

        // if behavior is defined and this function is extended, call that instead of default
        if (!!opts.behavior && this['scroll_'+opts.behavior] !== undefined) {
            return this['scroll_'+opts.behavior].call(this);
        }

        if (state.isInvalidPage || state.isDuringAjax || state.isDone || state.isDestroyed || state.isPaused || !this._nearbottom()) return;

        this.retrieve();
    },

    // update options
    update: function(key, value) {
        if ($.isPlainObject(key)) {
            if (key.path !== undefined) {
                key.path = this._parsepath(key.path);
            }

            this.options = $.extend(true, this.options, key);
        }
        else if (typeof(key) == 'string' && typeof(value) !== 'undefined') {
            if (key == 'path') {
                value = this._parsepath(value);
            }

            var opts = {};
            opts[key] = value;

            this.options = $.extend(true, this.options, opts);
        }

        return this;
    },

    // reset instance
    reset: function(key, value) {
        this.update(key, value);

        var opts = this.options;

        if (opts.state.isInvalidPage) {
            return;
        }

        this.options = $.extend(true, opts, {
            state: {
                isDuringAjax: false,
                isPaused: false,
                isDone: false, // For when it goes all the way through the archive.
                isDestroyed: false,
                currPage: 1
            },
            distancePx: undefined
        });

        opts.loading.msg
        .find('img')
        .show()
        .parent()
        .find('div').html(opts.loading.msgText);

        this._binding('bind');

        return this;
    },

    enable: function() {
        this.options = $.extend(true, this.options, {
            state: {
                isDuringAjax: false,
                isPaused: false,
                isDone: false
            }
        });

        this._binding('bind');

        return this;
    },

    disable: function() {
        this.options = $.extend(true, this.options, {
            state: {
                isDuringAjax: false,
                isPaused: false,
                isDone: true
            }
        });

        this._binding('unbind');

        return this;
    },

    // Destroy current instance of plugin
    destroy: function() {
        this.options.state.isDestroyed = true;

        this._error('destroy');

        return this;
    },

    /*
     * ----------------------------
     * Private methods
     * ----------------------------
     */

    // Fundamental aspects of the plugin are initialized
    _create: function(options, callback) {
        // Add custom options to defaults
        var opts = $.extend(true, {}, $.infinitescroll.defaults, options);

        if ($.isFunction(opts.beforeCreate)) {
            opts.beforeCreate.apply(this, opts);
        }

        // Validate selectors if forceCreate is false
        if (!this._checkSelectors(options)) {
            this._debug('Some of selectors is invalid.');
            if (!opts.forceCreate) {
                return false;
            }
        }

        this.options = opts;

        if (opts.path) {
            opts.path = this._parsepath(opts.path);
        } else {
            // Validate page fragment path
            var path = $(opts.nextSelector).attr('href');
            if (path) {
                // Set the path to be a relative URL from root.
                opts.path = this._parsepath(path);
            } else {
                path = this.element.data('infinitescroll-path');
                if (path) {
                    opts.path = this._parsepath(path);
                } else {
                    this._debug('None element found with .nextSelector value.');
                    if (opts.forceCreate) {
                        throw 'Can not determine path option.';
                    } else {
                        return false;
                    }
                }
            }
        }

        // fragSelector is 'page fragment' option for .load() / .ajax() calls
        opts.fragSelector = opts.fragSelector || this.element;

        // distance from nav links to bottom
        // computed as: height of the document + top offset of container - top offset of nav link
        opts.distancePx = $(document).height();
        $nav = $(opts.navSelector);
        if ($nav.size() > 0) {
            opts.distancePx -= $nav.offset().top;
        }

        // loading.selector - if we want to place the load message in a specific selector, defaulted to the fragSelector
        opts.loading.selector = opts.loading.selector || opts.fragSelector;

        // Define loading.msg
        opts.loading.msg = opts.loading.msg || $('<div id="'+opts.loading.wrapperId+'">').html('<img alt="Loading..." src="' + opts.loading.img + '" /><div>' + opts.loading.msgText + '</div>');

        // determine loading.start actions
        if (!opts.loading.start) {
            opts.loading.start = function() {
                opts.loading.msg
                .appendTo(opts.loading.selector)
                .show(opts.loading.speed, function () {
                    infinitescroll_ajax(opts);
                });
            };
        }

        // determine loading.finished actions
        if (!opts.loading.finished) {
            opts.loading.finished = function() {
                opts.loading.msg.fadeOut(opts.loading.speed);
            };
        }

        // callback loading
        opts.callback = function(instance, data) {
            if (!!opts.behavior && instance['_callback_'+opts.behavior] !== undefined) {
                instance['_callback_'+opts.behavior].call($(opts.fragSelector)[0], data);
            }

            if (callback) {
                callback.call($(opts.fragSelector)[0], data, opts);
            }
        };

        this._setup();

        // Preload loading.img
        (new Image()).src = opts.loading.img;

        // Return true to indicate successful creation
        return true;
    },

    // Behavior is determined
    // If the behavior option is undefined, it will set to default and bind to scroll
    _setup: function() {
        var opts = this.options;

        // if behavior is defined and this function is extended, call that instead of default
        if (!!opts.behavior && this['_setup_'+opts.behavior] !== undefined) {
            return this['_setup_'+opts.behavior].call(this);
        }

        this._binding('bind');

        return true;
    },

    // Bind or unbind from scroll
    _binding: function(binding) {
        var instance = this,
            opts = instance.options;

        // if behavior is defined and this function is extended, call that instead of default
        if (!!opts.behavior && this['_binding_'+opts.behavior] !== undefined) {
            return this['_binding_'+opts.behavior].call(this);
        }

        this._debug('Binding state', binding);

        if (binding !== 'bind' && binding !== 'unbind') {
            this._debug('Binding value  ' + binding + ' is invalid.');
            return false;
        }

        var bind_id = 'smartscroll.infscr.' + opts.infid;
        if (binding == 'unbind') {
            opts.binder.unbind(bind_id);
        } else {
            opts.binder.bind(bind_id, function(){
                instance.scroll();
            });
        }
    },

    // Pause/temporarily disable plugin from firing
    _pausing: function(pause) {
        var opts = this.options;

        // if behavior is defined and this function is extended, call that instead of default
        if (!!opts.behavior && this['_pausing_'+opts.behavior] !== undefined) {
            return this['_pausing_'+opts.behavior].call(this,pause);
        }

        this._debug('Pausing state', opts.state.isPaused);

        // If pause is not 'pause' or 'resume', toggle it's value
        if (pause !== 'pause' && pause !== 'resume' && pause !== null) {
            this._debug('Invalid argument. Toggling pause value instead');
        }

        pause = (pause && (pause == 'pause' || pause == 'resume')) ? pause : 'toggle';

        switch (pause) {
            case 'pause':
                opts.state.isPaused = true;
                break;

            case 'resume':
                opts.state.isPaused = false;
                break;

            case 'toggle':
                opts.state.isPaused = !opts.state.isPaused;
                break;
        }

        return opts.state.isPaused;
    },

    // Load Callback
    _loadcallback: function($box, data) {
        var opts = this.options,
            callback = opts.callback,
            result = (opts.state.isDone) ? 'done' : (!opts.autoAppended ? 'no-append' : 'append'),
            frag;

        // if behavior is defined and this function is extended, call that instead of default
        if (!!opts.behavior && this['_loadcallback_'+opts.behavior] !== undefined) {
            return this['_loadcallback_'+opts.behavior].call(this, $box, data);
        }

        switch (result) {
            case 'done':
                this._showdone();
                return false;

            case 'no-append':
                if (opts.dataType == 'html') {
                    data = '<div>' + data + '</div>';
                    data = $(data).find(opts.itemSelector);
                }
                break;

            case 'append':
                var children = $box.children();

                // if it didn't return anything
                if (children.length === 0) {
                    return this.finish();
                }

                // use a documentFragment because it works when content is going into a table or UL
                frag = document.createDocumentFragment();
                while ($box[0].firstChild) {
                    frag.appendChild($box[0].firstChild);
                }

                $(opts.fragSelector)[0].appendChild(frag);
                // previously, we would pass in the new DOM element as context for the callback
                // however we're now using a documentfragment, which doesnt havent parents or children,
                // so the context is the contentContainer guy, and we pass in an array
                //   of the elements collected as the first argument.

                data = children.get();
                break;
        }

        // loadingEnd function
        opts.loading.finished.call($(opts.fragSelector)[0], opts);


        // smooth scroll to ease in the new content
        if (opts.animate) {
            var scrollTo = $(window).scrollTop() + $(opts.loading.wrapperId).height() + opts.extraScrollPx + 'px';
            $('html,body').animate({ scrollTop: scrollTo }, 800, function () {
                opts.state.isDuringAjax = false;
            });
        } else {
            opts.state.isDuringAjax = false; // once the call is done, we can allow it again.
        }

        callback(this, data);
    },

    // find the number to increment in the path.
    _parsepath: function(path) {
        console.log(path);
        var opts = this.options;

        // if behavior is defined and this function is extended, call that instead of default
        if (!!opts.behavior && this['_parsepath_'+opts.behavior] !== undefined) {
            return this['_parsepath_'+opts.behavior].call(this,path);
        }

        this._debug('Determine root path', path);

        if (!!opts.pathParser) {
            path = opts.pathParser(path, this.options.state.currPage+1);
        }
        // /path/to?k1=v1&page=1
        // /path/to?page=1&k2=v2
        else if (path.match(/^(.*?[?&]page=)\d(.*?$)/)) {
            path = path.match(/^(.*?[?&]page=)\d(.*?$)/).slice(1);
        }
        // /path/to/page/1
        // /path/to/page/1?k1=v2
        else if (path.match(/^(.*?\/page\/)\d(.*?$)/)) {
            path = path.match(/^(.*?\/page\/)\d(.*?$)/).slice(1);
        } else {
            this._debug('Sorry, we couldn\'t parse your Next (Previous Posts) URL. Verify your the css selector points to the correct A tag. If you still get this error: yell, scream, and kindly ask for help at infinite-scroll.com.');
            // Get rid of isInvalidPage to allow permalink to state
            opts.state.isInvalidPage = true;  //prevent it from running on this page.
        }

        return path;
    },

    _nearbottom: function() {
        var opts = this.options,
            bottomPx = 0 + $(document).height() - (opts.binder.scrollTop()) - $(window).height();

        // if behavior is defined and this function is extended, call that instead of default
        if (!!opts.behavior && this['_nearbottom_'+opts.behavior] !== undefined) {
            return this['_nearbottom_'+opts.behavior].call(this);
        }

        this._debug('Calc page scroll', opts.distancePx, bottomPx, opts.bufferPx);

        // if distance remaining in the scroll (including buffer) is less than the orignal nav to bottom....
        return (bottomPx - opts.bufferPx < opts.distancePx);
    },

    // grab each paging selector option and see if any fail
    _checkSelectors: function(opts) {
        var selectors = ['navSelector', 'nextSelector'],
            key, val,
            i, j;
        for (i = 0, j = selectors.length; i < j; i++) {
          key = selectors[i];
          val = opts[key];
          if (typeof(val) === 'undefined' || $(val).length === 0) {
            this._debug('Paging option `' + key + '` found no element.');
            return false;
          }
        }

        return true;
    },

    // Show done message
    _showdone: function() {
        var opts = this.options;

        // if behavior is defined and this function is extended, call that instead of default
        if (!!opts.behavior && this['_showdone_'+opts.behavior] !== undefined) {
            return this['_showdone_'+opts.behavior].call(this);
        }

        opts.loading.msg
        .find('img')
        .hide()
        .parent()
        .find('div').html(opts.loading.finishedMsg).animate({ opacity: 1 }, 2000, function () {
            $(this).parent().fadeOut(opts.loading.speed);
        });

        // user provided callback when done
        opts.errorCallback.call($(opts.fragSelector)[0],'done');
    },

    // Custom error
    _error: function(xhr) {
        var opts = this.options;

        // if behavior is defined and this function is extended, call that instead of default
        if (!!opts.behavior && this['_error_'+opts.behavior] !== undefined) {
            return this['_error_'+opts.behavior].call(this,xhr);
        }

        this._debug('Error', xhr);

        if (xhr !== 'destroy' && xhr !== 'end') {
            xhr = 'unknown';
        }

        if (xhr == 'end') {
            this._showdone();
        }

        this.disable();
    },

    _isXhrSuccess: function(status, jqXHR) {
        return (typeof(jqXHR.isResolved) !== 'undefined') ? jqXHR.isResolved() : (status === 'success' || status === 'notmodified');
    },

    // Console log wrapper
    _debug: function() {
        if (window.console && this.options && this.options.debug) {
            console.log.call(console, arguments);
        }
    }

};


/*
 *  ----------------------------
 *  Infinite Scroll function
 *  ----------------------------
 *  Borrowed logic from the following...
 *
 *  jQuery UI
 *  - https://github.com/jquery/jquery-ui/blob/master/ui/jquery.ui.widget.js
 *
 *  jCarousel
 *  - https://github.com/jsor/jcarousel/blob/master/lib/jquery.jcarousel.js
 *
 *  Masonry
 *  - https://github.com/desandro/masonry/blob/master/jquery.masonry.js
 */

$.fn.infinitescroll = function(options, callback) {
    var thisCall = typeof options;

    switch (thisCall) {
        case 'string':  // method call
            var args = Array.prototype.slice.call(arguments, 1);

            this.each(function () {
                var instance = $.data(this, 'infinitescroll');
                if (!instance) { // not setup yet
                    return false;
                }

                if (!$.isFunction(instance[options]) || options.charAt(0) === '_') {
                    return false;
                }

                instance[options].apply(instance, args);
            });
            break;

        case 'object':  // creation
            this.each(function () {
                var instance = $.data(this, 'infinitescroll');

                if (instance) {
                    // update options of current instance
                    instance.update(options);
                } else {
                    // initialize new instance
                    instance = new $.infinitescroll(options, callback, this);

                    // don't attach if instantiation failed
                    if (!instance.failed) {
                        $.data(this, 'infinitescroll', instance);
                    }
                }
            });
            break;
    }

    return this;
};



/*
 * smartscroll: debounced scroll event for jQuery *
 * https://github.com/lukeshumard/smartscroll
 * Based on smartresize by @louis_remi: https://github.com/lrbabe/jquery.smartresize.js *
 * Copyright 2011 Louis-Remi & Luke Shumard * Licensed under the MIT license. *
 */

var event = $.event,
    scrollTimeout;

event.special.smartscroll = {
    setup: function () {
        $(this).bind("scroll", event.special.smartscroll.handler);
    },
    teardown: function () {
        $(this).unbind("scroll", event.special.smartscroll.handler);
    },
    handler: function (event, execAsap) {
        // Save the context
        var context = this,
            args = arguments;

        // set correct event type
        event.type = "smartscroll";

        if (scrollTimeout) { clearTimeout(scrollTimeout); }
        scrollTimeout = setTimeout(function () {
            $.event.handle.apply(context, args);
        }, execAsap === "execAsap" ? 0 : 100);
    }
};

$.fn.smartscroll = function (fn) {
    return fn ? this.bind("smartscroll", fn) : this.trigger("smartscroll", ["execAsap"]);
};

})(window, jQuery);
